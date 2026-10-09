const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development'

  return {
    entry: './src/index.tsx',

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isDev ? '[name].js' : '[name].[contenthash:8].js',
      chunkFilename: isDev ? '[name].chunk.js' : '[name].[contenthash:8].chunk.js',
      publicPath: '/',
      clean: true
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },

    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: { browsers: ['> 1%', 'last 2 versions'] } }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript'
              ]
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader'
          ]
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|ico|woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource'
        },
        {
          test: /\.ttf$/,
          type: 'asset/resource'
        }
      ]
    },

    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        favicon: './public/favicon.ico',
        inject: true
      }),

      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'public'),
            to: '.',
            globOptions: { ignore: ['**/index.html'] }
          }
        ]
      }),

      new MiniCssExtractPlugin({
        filename: isDev ? '[name].css' : '[name].[contenthash:8].css'
      }),

      new MonacoWebpackPlugin({
        languages: ['c', 'cpp', 'java', 'javascript', 'typescript', 'json', 'markdown', 'plaintext', 'python', 'html', 'css']
      }),

      new webpack.DefinePlugin({
        'process.env': JSON.stringify({
          NODE_ENV: isDev ? 'development' : 'production',
          REACT_APP_SOCKET_URL: process.env.REACT_APP_SOCKET_URL || (isDev ? 'http://localhost:5000' : ''),
          REACT_APP_API_URL: process.env.REACT_APP_API_URL || (isDev ? 'http://localhost:5000/api' : '/api')
        })
      })
    ],

    devServer: {
      port: 3000,
      host: 'localhost',
      hot: true,
      historyApiFallback: {
        index: '/index.html',
        disableDotRule: true,
        rewrites: [
          { from: /^\/(?!api|collab|socket\.io).*/, to: '/index.html' }
        ]
      },
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:5000',
          changeOrigin: true
        },
        {
          context: ['/socket.io'],
          target: 'http://localhost:5000',
          ws: true,
          changeOrigin: true
        },
        {
          context: ['/collab'],
          target: 'ws://localhost:5000',
          ws: true,
          changeOrigin: true
        }
      ],
      client: {
        overlay: {
          errors: true,
          warnings: false,
          runtimeErrors: (error) => {
            const msg = error?.message || ''
            if (
              msg.includes('ResizeObserver loop completed') ||
              msg.includes('ResizeObserver loop limit') ||
              msg === 'Script error.' ||
              msg.includes('Script error') ||
              msg.includes('TextModel got disposed before DiffEditorWidget model got reset') ||
              msg.includes('DiffEditorWidget model got reset') ||
              msg.includes('TextModel got disposed')
            ) {
              return false
            }
            return true
          }
        }
      }
    },

    devtool: isDev ? 'eval-source-map' : 'source-map',

    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all'
          }
        }
      }
    },

    performance: {
      hints: isDev ? false : 'warning',
      maxEntrypointSize: 1024 * 1024 * 5, // 5MB (Monaco is large)
      maxAssetSize: 1024 * 1024 * 5
    }
  }
}
