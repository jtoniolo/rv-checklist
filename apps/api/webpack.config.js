const path = require('node:path');
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');

module.exports = {
  // Keep node_modules external (real runtime `require`) rather than bundling
  // them. TypeORM loads its Postgres driver via a dynamic `require(name)` that
  // webpack can't bundle; leaving dependencies external lets it resolve `pg` at
  // runtime. Only our own relative/aliased modules are bundled.
  externalsPresets: { node: true },
  externals: [
    ({ request }, callback) => {
      if (request && /^[@a-z]/i.test(request) && !request.startsWith('.')) {
        return callback(undefined, `commonjs ${request}`);
      }
      return callback();
    },
  ],
  output: {
    path: path.join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      // Preserve the `externals` above instead of letting the plugin replace it.
      // The plugin's default node-externals doesn't match pnpm's symlinked
      // layout, so without this everything (incl. TypeORM) gets bundled and its
      // dynamic `require('pg')` fails at runtime.
      mergeExternals: true,
    }),
  ],
};
