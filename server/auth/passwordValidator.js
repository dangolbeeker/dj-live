const {validation: {password}} = require('../../mainroom.config');

const MIN_LENGTH = password.minLength;
const MAX_LENGTH = password.maxLength;
const MIN_LOWERCASE = password.minLowercase;
const MIN_UPPERCASE = password.minUppercase;
const MIN_NUMERIC = password.minUppercase;
const MIN_SPECIAL_CHARS = password.minSpecialChars;
const ALLOWED_SPECIAL_CHARS = Array.from(password.allowedSpecialChars)
const ALLOWED_SPECIAL_CHARS_ESCAPED = ALLOWED_SPECIAL_CHARS.join('\\'); // escape all characters

const LOWERCASE_REGEX = `(?=.*[a-z]{${MIN_LOWERCASE},})`;
const UPPERCASE_REGEX = `(?=.*[A-Z]{${MIN_UPPERCASE},})`;
const NUMERIC_REGEX = `(?=.*[0-9]{${MIN_NUMERIC},})`;
const SPECIAL_CHAR_REGEX = `(?=.*[${ALLOWED_SPECIAL_CHARS_ESCAPED}]{${MIN_SPECIAL_CHARS},})`;

const REGEX = new RegExp(`^${LOWERCASE_REGEX}${UPPERCASE_REGEX}${NUMERIC_REGEX}${SPECIAL_CHAR_REGEX}.*$`);

module.exports.validatePassword = password => {
    return password.length >= MIN_LENGTH
        && password.length <= MAX_LENGTH
        && REGEX.test(password);
};

module.exports.getInvalidPasswordMessage = () => {
    return [
        'Invalid password. Password must contain:',
        `• Between ${MIN_LENGTH}-${MAX_LENGTH} characters`,
        `• At least ${MIN_LOWERCASE} lowercase character${MIN_LOWERCASE > 1 ? 's' : ''}`,
        `• At least ${MIN_UPPERCASE} uppercase character${MIN_UPPERCASE > 1 ? 's' : ''}`,
        `• At least ${MIN_NUMERIC} number${MIN_NUMERIC > 1 ? 's' : ''}`,
        `• At least ${MIN_SPECIAL_CHARS} special character${MIN_SPECIAL_CHARS > 1 ? 's' : ''}:
            ${ALLOWED_SPECIAL_CHARS.join(' ')}`
    ];
};