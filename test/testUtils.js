module.exports.sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports.overrideEnvironmentVariables = overrides => ({
    andDo: async testCallback => await overrideEnvVarsAndDo(overrides, testCallback),
    beforeAll: () => overrideEnvVarsBeforeAll(overrides)
});

async function overrideEnvVarsAndDo(overrides, testCallback) {
    const originalEnvVars = overrideEnvVars(overrides);
    await testCallback();
    restoreEnvVars(originalEnvVars);
}

function overrideEnvVarsBeforeAll(overrides) {
    let originalEnvVars;

    beforeAll(() => {
        originalEnvVars = overrideEnvVars(overrides);
    });

    afterAll(() => restoreEnvVars(originalEnvVars));
}

function overrideEnvVars(overrides) {
    const originalEnvVars = new Map();

    Object.entries(overrides).forEach(entry => {
        const key = entry[0];
        const value = entry[1];

        const originalEnvVar = process.env[key];
        originalEnvVars.set(key, originalEnvVar);

        process.env[key] = value.toString();
    });

    return originalEnvVars;
}

function restoreEnvVars(originalEnvVars) {
    originalEnvVars.forEach((value, key) => {
        process.env[key] = value;
    });
}