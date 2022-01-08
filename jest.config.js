module.exports = {
    moduleNameMapper: {
        '\.s?[ac]ss$': '<rootDir>/test/cssStub.js',
    },
    setupFiles: [
        '<rootDir>/jest.init.js'
    ],
    collectCoverageFrom: [
        '<rootDir>/(client|server)/**/*.js'
    ],
    transform: {
        '^.+\\.[jt]sx?$': 'babel-jest',
        '^.+\\.svg$': 'jest-svg-transformer'
    }
};