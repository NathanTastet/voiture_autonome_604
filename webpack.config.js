const path = require('path');
const webpack = require('webpack');

/*
 * Webpack Plugins
 */
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const ProductionPlugins = [
  new webpack.DefinePlugin({
    "process.env": {
      NODE_ENV: JSON.stringify("production")
    }
  })
];

const debug = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const rootAssetPath = path.join(__dirname, 'assets');

module.exports = {
  context: __dirname,
  entry: {
    main_js: './assets/js/main',
    dashboard: './assets/js/dashboard',  // <- ajoute ça
    main_css: [
      path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'all.css'),
      path.join(__dirname, 'assets', 'css', 'style.css'),
      path.join(__dirname, 'assets', 'scss', 'custom-bootstrap.scss'), //custom bootstrap en dernier
    ],
  },
  mode: debug,
  output: {
    chunkFilename: "[id].js",
    filename: "[name].bundle.js",
    path: path.join(__dirname, "app", "static", "build"),
    publicPath: "/static/build/"
  },
  resolve: {
    extensions: [".js", ".jsx", ".css"]
  },
  devtool: debug ? "eval-source-map" : false,
  plugins: [
    new MiniCssExtractPlugin({ filename: "[name].bundle.css" }),
    new webpack.ProvidePlugin({ $: "jquery", jQuery: "jquery" })
  ].concat(debug ? [] : ProductionPlugins),
  module: {
    rules: [
      {
        test: /\.less$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'less-loader'
        ],
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
      {
        test: /\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'sass-loader',
        ],
      },
      { test: /\.html$/, type: 'asset/source' },
      {
        test: /\.(woff(2)?|eot|ttf|otf|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name][ext]'  // ça crée app/static/build/fonts/
        }
      },
      {
        test: /\.(ttf|eot|svg|png|jpe?g|gif|ico)(\?.*)?$/i,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]'
        }
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: ["@babel/preset-env"],
          cacheDirectory: true
        }
      },
    ],
  },

  // ✅ Masquer les warnings Sass de Bootstrap (sans bloquer les vrais logs)
  infrastructureLogging: {
    level: 'error'  // ou 'warn' pour garder les warnings importants
  }
};
