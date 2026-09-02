/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.wompi.co",

      // Dominios autorizados para mostrar la aplicación en un iframe
      "frame-ancestors 'self' https://cotrafasocial.com https://www.cotrafasocial.com",

      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://www.google.com https://www.gstatic.com",
      "frame-src https://www.google.com https://recaptcha.google.com",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },

          // No agregar X-Frame-Options:
          // CSP frame-ancestors controla qué sitios pueden embeber la aplicación.

          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;