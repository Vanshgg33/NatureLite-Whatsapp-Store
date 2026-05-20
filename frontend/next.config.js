/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Cloudinary and other CDNs (Facebook, Instagram, etc.) already serve
    // optimised images. Facebook CDN URLs are signed with session tokens that
    // return 403 when fetched server-side by Next.js's image proxy, crashing
    // the page. Disable the proxy — lazy-loading and layout stability still work.
    unoptimized: true,
  },
};

module.exports = nextConfig;
