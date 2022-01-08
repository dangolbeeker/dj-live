const {Schema} = require('mongoose');
const config = require('../../mainroom.config');

const PasswordResetToken = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'},
    tokenHash: String,
    created: {type: Date, index: {expires: config.storage.passwordResetToken.ttl}}
});

module.exports = PasswordResetToken;