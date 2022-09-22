const ExternalModules = require('webpack/lib/ExternalModule');
const PluginName = 'AutoExternalPlugin';
const assert = require('assert');
const { flattenDeep } = require('lodash');

class AutoExternalPlugin {
  /**
   * 自动CDN插件构造函数
   * @param externals 外部扩展（CDN）配置:\{lodash: {varName: '_', url: '', css: ''}\}
   * @param sortJs js排序（Object.keys(externals)）
   * @param sortCss css排序（[css]）
   * @param required
   * @param getTagAttrs
   * @param checkIgnore
   */
  constructor ({ externals = {}, sortJs = list => list, sortCss = list => list, required, getTagAttrs, checkIgnore } = {}) {
    this.externals = externals;
    this.sortJs = sortJs;
    this.sortCss = sortCss;
    this.required = required || [];
    this.getTagAttrs = typeof getTagAttrs === 'function' ? getTagAttrs : () => ({});
    this.externalModules = {};
    this.checkIgnore = typeof checkIgnore === 'function' ? checkIgnore : () => false;
  }

  apply (compiler) {
    compiler.hooks.normalModuleFactory.tap(PluginName, (normalModuleFactory) => {
      normalModuleFactory.hooks.parser.for('javascript/auto').tap(PluginName, (parser) => {
        parser.hooks.import.tap(PluginName, (statement, source) => {
          // 如果导入的为需要排除的则标记为true，source为导入的文件名
          if (this.externals[source]) {
            this.externalModules[source] = true;
          }
        });
      });
      // factory 是创建模块的方法
      // data 是创建模块的参数
      normalModuleFactory.hooks.factory.tap(PluginName, factory => (data, callback) => {
        const dependencies = data.dependencies;
        const value = dependencies[0].request;
        // 判断是否有排除标记，如有则排除
        const checkResult = this.checkIgnore(data, value, this.externals, this.externalModules, this.required);
        if (checkResult === true) {
          factory(data, callback);
          return;
        }
        if (!checkResult) {
          if (this.externalModules[value] || (this.externals[value] && this.required.includes(value))) {
            const { varName } = this.externals[value];
            callback(null, new ExternalModules(varName, 'window', value));
            return;
          }
          factory(data, callback);
          return;
        }
        callback(null, checkResult);
      });
    });
    compiler.hooks.compilation.tap('InlinePlugin', (compilation) => {
      let hook = compilation.hooks.htmlWebpackPluginAlterAssetTags;

      // 支持v4
      if (!hook) {
        const [HtmlWebpackPlugin] = compiler.options.plugins.filter(
          (plugin) => plugin.constructor.name === 'HtmlWebpackPlugin');
        if (!HtmlWebpackPlugin) {
          assert(HtmlWebpackPlugin, 'Unable to find an instance of HtmlWebpackPlugin in the current compilation.');
          return;
        }
        hook = HtmlWebpackPlugin.constructor.getHooks(compilation).alterAssetTagGroups;
      }
      hook.tapAsync(PluginName, (htmlPluginData, callback) => callback(null, this.processPluginData(compilation, htmlPluginData)));
    });
  }

  processPluginData (compilation, htmlPluginData) {
    const keys = Object.keys(this.externals).filter(key => this.externalModules[key] || this.required.includes(key));
    const jsKeys = this.sortJs(keys);
    this.addJs(jsKeys, compilation, htmlPluginData);
    const cssKeys = this.sortCss(this.getCssKeys(keys));
    this.addCss(cssKeys, compilation, htmlPluginData);
    (htmlPluginData.head || htmlPluginData.headTags).push({
      tagName: 'script',
      closeTag: true,
      attributes: {
        type: 'text/javascript'
      },
      innerHTML: `
        window.externalsCDN = ${JSON.stringify(this.externals)};
        window.importByCDN = function (name) {
          return new Promise(function (resolve, reject) {
            var item = window.externalsCDN[name];
            if (!item) {
              return reject(new Error('cdn 「' + name + '」 is not config'));
            }
            var all = [];
            function success() {
              resolve(window[item.varName || name]);
            }
            function loaded(url) {
              var index = all.indexOf(url);
              index != -1 && all.splice(index, 1);
              all.length || success();
            }
            var script = document.querySelector('script[data-cdnmodule="' + name + '"]');
            if (script) {
              return success();
            }
            script = document.createElement('script');
            script.src = item.url;
            script.dataset.cdnmodule = name;
            script.onload = function() {
              loaded(item.url);
            }
            script.onerror = function (e) {
              reject(new Error('cdn 「' + name + '」 load error', e));
            }
            all.push(item.url);
            document.head.appendChild(script);

            var cssList = Array.isArray(item.css) ? item.css : [item.css];
            if (cssList.length) {
              for (cssUrl of cssList) {
                var css = document.querySelector('link[rel=stylesheet][href="' + cssUrl + '"]');
                if (!css) {
                  css = document.createElement('link');
                  css.href = cssUrl;
                  css.rel = 'stylesheet';
                  css.onload = css.onerror = function () {
                    loaded(cssUrl);
                  }
                  all.push(cssUrl);
                  document.head.appendChild(css);
                }
              }
            }
          });
        }
      `
    });
    return htmlPluginData;
  }

  getAttributes (url) {
    const attrs = this.getTagAttrs(url);
    return typeof attrs === 'object' && !Array.isArray(attrs) ? attrs : {};
  }

  processJsTags (compilation, htmlPluginData, item, key) {
    return {
      tagName: 'script',
      closeTag: true,
      attributes: {
        type: 'text/javascript',
        src: item.url,
        'data-cdnmodule': key,
        ...this.getAttributes(item.url, item)
      }
    };
  }

  processCssTags (compilation, htmlPluginData, value) {
    return {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: value,
        ...this.getAttributes(value)
      }
    };
  }

  addJs (keys, compilation, htmlPluginData) {
    const tags = keys.map(key => this.processJsTags(compilation, htmlPluginData, this.externals[key], key));
    (htmlPluginData.body || htmlPluginData.bodyTags).unshift(...tags);
  }

  getCssKeys (keys) {
    return flattenDeep(keys.map(key => this.externals[key].css)
      .filter(css => !!css)
      .map(css => Array.isArray(css) ? css : [css])
    );
  }

  addCss (keys, compilation, htmlPluginData) {
    const tags = keys.map(key => this.processCssTags(compilation, htmlPluginData, key));
    (htmlPluginData.head || htmlPluginData.headTags).push(...tags);
  }
}

export default AutoExternalPlugin;
