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
    devtool: 'source-map',

    entry: [
        './lib/web/assets/main.js',
        './lib/web/assets/main.scss'
    ],

    output: {
        path: path.resolve(__dirname, './lib/web/dist'),
        publicPath: '/'
    },

    resolve: {
        extensions: ['.js', '.scss'],
        alias: {
            '@scss': path.resolve(__dirname, 'lib/web/assets/scss')
        }
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
            // Proxy requests to Express server
            host: 'localhost',
            port: 3000,
            proxy: 'http://localhost:4000'
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
                test: /\.js$/,
                use: [
                    {
                        loader: 'source-map-loader'
                    }
                ],
                enforce: 'pre'
            },
            {
                test: /.s?css$/,
                use: [
                    MiniCssExtractPlugin.loader,
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
                                includePaths: [
                                    path.resolve(__dirname, 'lib/web/assets/scss')
                                ],
                                fiber: false
                            }
                        }
                    }
                ]
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                parallel: true,
            }),
            new CssMinimizerPlugin({
                minimizerOptions: {
                    preset: [
                        'default',
                        {
                            discardComments: { removeAll: true }
                        }
                    ]
                }
            })
        ],
    }
};
