const path = require("path");
const LicenseWebpackPlugin =
  require("license-webpack-plugin").LicenseWebpackPlugin;

module.exports = {
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "typescript",
            },
          },
        },
        type: "javascript/auto",
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  optimization: {
    minimize: true,
  },
  plugins: [
    new LicenseWebpackPlugin({
      stats: {
        warnings: true,
        errors: true,
      },
      handleMissingLicenseText: (packageName: string, licenseType: string) => {
        console.log("Cannot find license for " + packageName);
        return "UNKNOWN";
      },
    }),
  ],
};
