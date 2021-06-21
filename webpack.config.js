module.exports = {
  target: 'webworker',
  entry: './index.js',
  resolve: {
    // we dont bundle for 'browser' in cloudflare workers
    mainFields: ['module', 'main'],
  },
}
