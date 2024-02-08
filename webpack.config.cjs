const BrowserSyncPlugin = require('browser-sync-webpack-plugin')
const {EnvironmentPlugin} = require('webpack');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const mode = (process.env.APP_ENV && process.env.APP_ENV.indexOf('production') != -1) ? 'production' : 'development'


module.exports = {
    mode,
    context: path.resolve(__dirname, ''),

    entry: [
        './lib/web/assets/main.js',
        './lib/web/assets/main.scss'
    ],

    output: {
        path: path.resolve(__dirname, './lib/web/dist'),
        publicPath: '/'    //->router    mode == 'development' ? '/' : '/daily-doasis'
    },

    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'lib/web/assets/favicon_io', to: '' }
            ],
        }),
        new EnvironmentPlugin({
            NODE_ENV: mode
        }),
        new BrowserSyncPlugin({
            // browse to http://localhost:3000/ during development,
            // ./public directory is being served
            host: 'localhost',
            port: 3000,
            server: {baseDir: ['lib/web/dist']}
        }),
        new MiniCssExtractPlugin({
            filename: '[name].css'
        }),
        //https://yonatankra.com/how-to-use-htmlwebpackplugin-for-multiple-entries/

        new HtmlWebpackPlugin({
            template: 'lib/web/index.hbs',
            filename: 'index-template.hbs',
        })
    ],
    module: {
        rules: [
            {
                test: /.s?css$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader
                    },
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: true,
                            url: false
                        }
                    },
                    {
                        loader: 'resolve-url-loader',
                        options: {
                            sourceMap: true
                        }
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            implementation: require('dart-sass'),
                            sourceMap: true,
                            sassOptions: {
                                fiber: false,
                                webpackImporter: true
                            },
                        }
                    }
                ]
            }
        ]
    },
    optimization: {
        minimize: true,//(mode === 'production'),
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    sourceMap: false,
                },
                test: /\.js(\?.*)?$/i,
            }),
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: [
                        "default",
                        {
                            discardComments: {removeAll: true},
                        },
                    ],
                },
            }),
        ],
    }
};
