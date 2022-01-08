const webpack = require('webpack');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const devMode = process.env.NODE_ENV !== 'production';

module.exports = {
    entry : './client/index.js',
    output : {
        filename : '[name].bundle.js',
        chunkFilename: '[name].chunk.js',
        path : path.resolve(__dirname, 'public'),
        publicPath: '/'
    },
    module : {
        rules : [
            {
                test: /\.s?[ac]ss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { url: false, sourceMap: true } },
                    { loader: 'sass-loader', options: { sourceMap: true } }
                ],
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: 'babel-loader'
            },
            {
                test: /\.woff($|\?)|\.woff2($|\?)|\.ttf($|\?)|\.eot($|\?)|\.svg($|\?)/,
                loader: 'url-loader'
            }
        ]
    },
    devtool: 'source-map',
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].style.css',
            chunkFilename: '[name].chunk.css'
        }),
        new webpack.ProvidePlugin({
            $: 'jquery',
            jQuery: 'jquery'
        }),
        // Ignore moment locale files. If required these can be imported from 'moment/locale/${LOCALE_CODE}'
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
    ],
    mode : devMode ? 'development' : 'production',
    watch : devMode,
    performance: {
        hints: process.env.NODE_ENV === 'production' ? 'warning' : false
    }
};