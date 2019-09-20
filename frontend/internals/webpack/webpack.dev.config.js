const path = require('path')
const fs = require('fs')
const glob = require('glob')
const webpack = require('webpack')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
const HtmlWebpackPlugin = require('html-webpack-plugin')
const AddAssetHtmlPlugin = require('add-asset-html-webpack-plugin')
const pkg = require(path.resolve(process.cwd(), 'package.json'))
const dllPlugin = pkg.dllPlugin
const logger = require('../../server/logger')

const plugins = [
  new webpack.HotModuleReplacementPlugin(),
  new webpack.NoEmitOnErrorsPlugin(),
  new HtmlWebpackPlugin({
    inject: true, // Inject all files that are generated by webpack
    template: 'frontend/index.html',
  }),
  new BundleAnalyzerPlugin({
    analyzerHost: process.env.ANALYZER_HOST || '127.0.0.1',
    analyzerPort: process.env.ANALYZER_PORT || 5555,
    openAnalyzer: false,
  }),
]

if (dllPlugin) {
  const filepaths = glob.sync(`${dllPlugin.path}/*.dll.js`).map((dllPath) => {
    return { filepath: dllPath, includeSourcemap: false }
  })
  plugins.push(new AddAssetHtmlPlugin(filepaths))
}

module.exports = require('./webpack.base.config.js')({
  output: {
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
  },
  devtool: 'eval-source-map',
  performance: {
    hints: false,
  },
  entry: {
    app: [
      'webpack-hot-middleware/client?reload=true',
      'react-hot-loader/patch',
      path.join(process.cwd(), 'frontend', 'app', 'index.js'),
    ],
  },
  plugins: dependencyHandlers().concat(plugins),
})

/**
 * Select which plugins to use to optimize the bundle's handling of
 * third party dependencies.
 *
 * If there is a dllPlugin key on the project's package.json, the
 * Webpack DLL Plugin will be used.  Otherwise the CommonsChunkPlugin
 * will be used.
 *
 */
function dependencyHandlers() {
  // Don't do anything during the DLL Build step
  if (process.env.BUILDING_DLL) { return [] }

  // If the package.json does not have a dllPlugin property, use the CommonsChunkPlugin
  if (!dllPlugin) {
    return [
      new webpack.optimize.CommonsChunkPlugin({
        name: 'vendor',
        children: true,
        minChunks: 2,
        async: true,
      }),
    ]
  }

  const dllPath = path.resolve(process.cwd(), dllPlugin.path || 'node_modules/react-spa-dlls')

  /**
   * If DLLs aren't explicitly defined, we assume all production dependencies listed in package.json
   * Reminder: You need to exclude any server side dependencies by listing them in dllConfig.exclude
   */
  if (!dllPlugin.dlls) {
    const manifestPath = path.resolve(dllPath, 'reactSpaDeps.json')

    if (!fs.existsSync(manifestPath)) {
      logger.error('The DLL manifest is missing. Please run `npm run build:dll`')
      process.exit(0)
    }

    return [
      new webpack.DllReferencePlugin({
        context: process.cwd(),
        manifest: require(manifestPath), // eslint-disable-line global-require
      }),
    ]
  }

  // If DLLs are explicitly defined, we automatically create a DLLReferencePlugin for each of them.
  const dllManifests = Object.keys(dllPlugin.dlls).map((name) => path.join(dllPath, `/${name}.json`))

  return dllManifests.map((manifestPath) => {
    if (!fs.existsSync(path)) {
      if (!fs.existsSync(manifestPath)) {
        logger.error(`The following Webpack DLL manifest is missing: ${path.basename(manifestPath)}`)
        logger.error(`Expected to find it in ${dllPath}`)
        logger.error('Please run: npm run build:dll')

        process.exit(0)
      }
    }

    return new webpack.DllReferencePlugin({
      context: process.cwd(),
      manifest: require(manifestPath), // eslint-disable-line global-require
    })
  })
}
