const {EOL} = require('os');

class CompositeError extends Error {
    constructor(errors) {
        let message = `${errors.length} errors occurred:${EOL}`;
        errors.forEach((err, index) => {
            const errorNumber = index + 1;
            message += `${errorNumber}) ${err.toString()}`;
            if (errorNumber < errors.length) {
                message += EOL;
            }
        });
        super(message);
        this.name = 'CompositeError';
        this.errors = errors;
    }
}

module.exports = CompositeError;