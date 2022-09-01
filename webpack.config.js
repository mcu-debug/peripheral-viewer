//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/** @typedef {import('webpack').Configuration} WebpackConfig **/
/** @type WebpackConfig */
const common = {
    mode: 'development',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    externals: {
        vscode: 'commonjs vscode'
    }
};

/** @type WebpackConfig[] */
module.exports = [
    {
        ...common,
        target: 'node',
        entry: {
            extension: './src/desktop/extension.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist', 'desktop'),
            libraryTarget: 'commonjs'
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js']
        }
    },
    {
        ...common,
        target: 'webworker',
        entry: {
            extension: './src/browser/extension.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist', 'browser'),
            libraryTarget: 'commonjs'
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            fallback: {
                buffer: require.resolve('buffer/'),
                stream: require.resolve('stream-browserify'),
                timers: require.resolve('timers-browserify')
            }
        },
        plugins: [
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer']
            })
        ]
    }
];
