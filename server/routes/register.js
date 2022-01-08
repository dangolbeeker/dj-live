const express = require('express');
const router = express.Router();
const passport = require('passport');
const loginChecker = require('connect-ensure-login');
const {siteName, brandingURL, faviconURL, validation: {usernameMaxLength, password}} = require('../../mainroom.config');

router.get('/', loginChecker.ensureLoggedOut(), (req, res) => {
    res.render('register', {
        siteName: siteName,
        title: `Register - ${siteName}`,
        brandingURL,
        faviconURL,
        usernameMaxLength,
        passwordMinLength: password.minLength,
        passwordMaxLength: password.maxLength,
        errors: {
            username: req.flash('username'),
            email: req.flash('email'),
            password: req.flash('password'),
            confirmPassword: req.flash('confirmPassword')
        },
        csrfToken: req.csrfToken(),
        redirectTo: req.query.redirectTo
    });
});

router.post('/', loginChecker.ensureLoggedOut(), (req, res, next) => {
    passport.authenticate('localRegister', {
        successRedirect: req.body.redirectTo || '/',
        failureRedirect: '/register',
        failureFlash: true
    })(req, res, next);
});

module.exports = router;