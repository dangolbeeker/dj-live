const express = require('express');
const router = express.Router();
const {User, PasswordResetToken} = require('../model/schemas');
const sanitise = require('mongo-sanitize');
const {randomBytes, createHash} = require('crypto');
const sesEmailSender = require('../aws/sesEmailSender');
const {validatePassword, getInvalidPasswordMessage} = require('../auth/passwordValidator');
const loginChecker = require('connect-ensure-login');
const {siteName, brandingURL, faviconURL} = require('../../mainroom.config');
const LOGGER = require('../../logger')('./server/routes/forgot-password.js');

router.get('/', loginChecker.ensureLoggedOut(), (req, res) => {
    res.render('forgotPassword', {
        siteName: siteName,
        title: `Forgot Password - ${siteName}`,
        brandingURL,
        faviconURL,
        messages: {
            info: req.flash('info'),
            errors: req.flash('errors')
        },
        csrfToken: req.csrfToken()
    });
});

router.post('/', loginChecker.ensureLoggedOut(), (req, res, next) => {
    const email = sanitise(req.body.email);
    User.findOne({email}, '_id email username displayName', (err, user) => {
        if (err) {
            LOGGER.error('An error occurred when finding user with email {}: {}', email, err);
            next(err);
        } else if (!user) {
            req.flash('errors', `Could not find a user with the email address ${email}`);
            res.redirect('/forgot-password');
        } else {
            randomBytes(16, (err, bytes) => {
                if (err) {
                    LOGGER.error('An error occurred when generating random bytes for password reset token: {}', err);
                    next(err);
                } else {
                    const token = bytes.toString('hex');
                    const passwordResetToken = new PasswordResetToken({
                        user: user._id,
                        tokenHash: hashToken(token),
                        created: Date.now()
                    });
                    passwordResetToken.save(err => {
                        if (err) {
                            LOGGER.error('An error occurred when saving password reset token for user with email {}: {}',
                                email, err);
                            next(err);
                        } else {
                            sesEmailSender.sendResetPasswordEmail(user, token)
                                .then(() => {
                                    req.flash('info', `An email has been sent to ${email} with a password reset link.`);
                                    res.redirect('/forgot-password');
                                })
                                .catch(() => {
                                    req.flash('errors', `An error occurred when trying to send an email to ${email}. Please try again.`);
                                    res.redirect('/forgot-password');
                                });
                        }
                    });
                }
            });
        }
    });
});

router.get('/reset', loginChecker.ensureLoggedOut(), (req, res, next) => {
    if (!req.query.token) {
        return res.redirect('/');
    }
    const sanitisedToken = sanitise(req.query.token);
    const tokenHash = hashToken(sanitisedToken);
    PasswordResetToken.findOne({tokenHash}, (err, token) => {
        if (err) {
            LOGGER.error('An error occurred when finding password reset token: {}', err);
            next(err);
        } else if (!token) {
            req.flash('errors', 'Password reset link does not exist or has expired. Please send email again.');
            return res.redirect('/forgot-password');
        } else {
            res.render('resetPassword', {
                siteName: siteName,
                title: `Reset Password - ${siteName}`,
                brandingURL,
                faviconURL,
                errors: {
                    password: req.flash('password'),
                    confirmPassword: req.flash('confirmPassword')
                },
                passwordResetToken: token,
                csrfToken: req.csrfToken()
            });
        }
    });
});

router.post('/reset', loginChecker.ensureLoggedOut(), (req, res, next) => {
    const sanitisedQuery = sanitise(req.body);
    const userId = sanitisedQuery.passwordResetToken.user;
    User.findById(userId).exec((err, user) => {
        if (err) {
            LOGGER.error(`An error occurred when finding user with _id {}: {}`, userId, err);
            next(err);
        } else if (!user) {
            LOGGER.error(`Could not find user (_id: {}) when resetting password: {}`, userId, err);
            res.status(404).send(`User (_id: ${escape(userId)}) not found`);
        }  else if (!validatePassword(sanitisedQuery.password)) {
            getInvalidPasswordMessage().forEach(line => req.flash('password', line));
            res.redirect('/forgot-password/reset');
        } else if (sanitisedQuery.password !== sanitisedQuery.confirmPassword) {
            req.flash('confirmPassword', 'Passwords do not match')
            res.redirect('/forgot-password/reset');
        } else {
            user.password = User.generateHash(sanitisedQuery.password);
            user.save(err => {
                if (err) {
                    LOGGER.error(`An error occurred when updating password for user with _id {}: {}`, userId, err);
                    next(err);
                } else {
                    PasswordResetToken.findByIdAndDelete(sanitisedQuery.passwordResetToken._id, err => {
                        LOGGER.error('An error occurred when trying to delete PasswordResetToken (_id: {}) from database. ' +
                            'These types of objects have an expiry, so MongoDB should delete this automatically. Error: {}',
                            sanitisedQuery.passwordResetToken._id, err);
                    });
                    res.redirect('/login');
                }
            });
        }
    });
});

const hashToken = token => createHash('sha256').update(token).digest('hex')

module.exports = router;