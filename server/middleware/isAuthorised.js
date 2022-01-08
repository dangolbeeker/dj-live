const sanitise = require('mongo-sanitize');

module.exports.isAuthorised = (req, res, next) => {
    if (req.params.username) {
        const username = sanitise(req.params.username.toLowerCase());
        if (username !== req.user.username.toString()) {
            return res.sendStatus(401);
        }
    }
    if (req.params.userId) {
        const userId = sanitise(req.params.userId);
        if (userId !== req.user._id.toString()) {
            return res.sendStatus(401);
        }
    }
    next();
};
