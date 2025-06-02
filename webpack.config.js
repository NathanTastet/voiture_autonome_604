const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
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
    pilotage: './assets/js/pilotage',
    // ---- Dashboard split ----
    "dash-common":  "./assets/js/dashboard/dash_common.js",
    "dash-connect": "./assets/js/dashboard/dash_connect.js",
    "dash-maps":  "./assets/js/dashboard/dash_maps.js",
    "dash-pilotage":  "./assets/js/dashboard/dash_pilotage.js",
    "dash-stats":  "./assets/js/dashboard/dash_stats.js",
    "dash-history": "./assets/js/dashboard/dash_history.js",
    main_css: [
      path.join(__dirname, 'assets', 'scss', 'custom-bootstrap.scss'), // custom bootstrap en dernier
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
    new webpack.ProvidePlugin({ $: "jquery", jQuery: "jquery" }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'assets/fonts'),
          to: 'fonts' // Résultat : app/static/build/fonts/
        }
      ]
    })
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
          filename: 'fonts/[name][ext]' // fallback aussi si d'autres polices sont importées via url()
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
    level: 'error'  // ou 'warn' si tu veux voir + de logs
  }
};
