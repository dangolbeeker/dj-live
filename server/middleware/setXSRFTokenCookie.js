module.exports.setXSRFTokenCookie = (req, res, next) => {
    res.cookie('XSRF-TOKEN', req.csrfToken());
    next();
};