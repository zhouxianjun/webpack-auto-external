# webpack-auto-external

<a name="AutoExternalPlugin"></a>

## AutoExternalPlugin
**Kind**: global class  
自适配排除扩展包webpack插件，如实际使用到的包在`externals`配置中会被排除，并添加script标签在html中
<a name="new_AutoExternalPlugin_new"></a>

### new AutoExternalPlugin(externals, sortJs, sortCss)
自动CDN插件构造函数


| Param | Description |
| --- | --- |
| externals | 外部扩展（CDN）配置:\{lodash: {varName: '_', url: '', css: ''}\} |
| sortJs | js排序（Object.keys(externals)） |
| sortCss | css排序（[css]） |

## 使用

```js
new AutoExternalPlugin({
  externals: {
    lodash: {
      url: 'https://xxx.cdn.com/lodash.js',
      varName: '_'
    },
    vant: {
      url: 'https://xxx.cdn.com/vant.js',
      varName: 'Vant',
      css: 'https://xxx.cdn.com/vant.css'
    }
  }
})
```
