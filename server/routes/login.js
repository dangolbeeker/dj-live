const express = require('express');
const router = express.Router();
const passport = require('passport');
const loginChecker = require('connect-ensure-login');
const {siteName, brandingURL, faviconURL} = require('../../mainroom.config');

router.get('/', loginChecker.ensureLoggedOut(), (req, res) => {
    res.render('login', {
        siteName: siteName,
        title: `Log In - ${siteName}`,
        brandingURL,
        faviconURL,
        errors: {
            login: req.flash('login')
        },
        csrfToken: req.csrfToken(),
        redirectTo: req.query.redirectTo
    });
});

router.post('/', loginChecker.ensureLoggedOut(), (req, res, next) => {
    passport.authenticate('localLogin', {
        successRedirect: req.body.redirectTo || '/',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next);
});

module.exports = router;

