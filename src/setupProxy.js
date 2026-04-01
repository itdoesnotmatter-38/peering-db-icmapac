const { createProxyMiddleware } = require("http-proxy-middleware");

const target = process.env.REACT_APP_PROXY_TARGET || "https://peeringdb-dashboard.vercel.app";

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
    })
  );
};
