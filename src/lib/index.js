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
   */
  constructor ({ externals = {}, sortJs = list => list, sortCss = list => list, required, getTagAttrs } = {}) {
    this.externals = externals;
    this.sortJs = sortJs;
    this.sortCss = sortCss;
    this.required = required || [];
    this.getTagAttrs = typeof getTagAttrs === 'function' ? getTagAttrs : () => ({});
    this.externalModules = {};
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
        if (this.externalModules[value] || (this.externals[value] || this.required.includes(value))) {
          const { varName } = this.externals[value];
          callback(null, new ExternalModules(varName, 'window', value));
        } else {
          factory(data, callback);
        }
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
    return htmlPluginData;
  }

  getAttributes (url) {
    const attrs = this.getTagAttrs(url);
    return typeof attrs === 'object' && !Array.isArray(attrs) ? attrs : {};
  }

  processJsTags (compilation, htmlPluginData, value) {
    return {
      tagName: 'script',
      closeTag: true,
      attributes: {
        type: 'text/javascript',
        src: value,
        ...this.getAttributes(value)
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
    const tags = keys.map(key => this.processJsTags(compilation, htmlPluginData, this.externals[key].url));
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
