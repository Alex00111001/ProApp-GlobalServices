const v = require('../validators/experiments-content-seo.validators');
const { buildSitemap, getPublishedContent, resolveRedirect } = require('../modules/seo/seo.service');
const handler = (work) => async (req, res, next) => { try { return await work(req, res); } catch (error) { return next(error); } };
exports.content = handler(async (req, res) => { const page = await getPublishedContent(v.publicContentParams.parse(req.params)); res.set('ETag', `\"${page.etag}\"`).set('Cache-Control', 'public, max-age=60, s-maxage=300').json(page); });
exports.sitemap = handler(async (req, res) => res.json(await buildSitemap({ ...v.sitemapParams.parse(req.params), persist: false })));
exports.redirect = handler(async (req, res) => { const result = await resolveRedirect(v.redirectQuery.parse(req.query)); if (!result) return res.status(404).json({ error: 'Redirect not found', code: 'SEO_REDIRECT_NOT_FOUND', correlationId: req.context?.correlationId }); return res.json(result); });
module.exports = exports;
