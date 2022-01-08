const MILLION = 1000000;
const THOUSAND = 1000;
const HUNDRED = 100;

export const shortenNumber = num => {
    if (num >= MILLION) {
        return addTwoDecimalPlacesIfNecessary(num / MILLION) + 'M';
    }
    if (num >= THOUSAND) {
        return addTwoDecimalPlacesIfNecessary(num / THOUSAND) + 'K';
    }
    return num;
};

const addTwoDecimalPlacesIfNecessary = num => {
    return Math.round((num + Number.EPSILON) * HUNDRED) / HUNDRED;
};

export const shortenFileSize = bytes => {
    const kb = bytes / 1024;
    if (kb >= 1024) {
        const mb = kb / 1024;
        if (mb >= 1024) {
            const gb = mb / 1024;
            if (gb >= 1024) {
                const tb = gb / 1024;
                return `${addTwoDecimalPlacesIfNecessary(tb)}TB`;
            }
            return `${addTwoDecimalPlacesIfNecessary(gb)}GB`;
        }
        return `${addTwoDecimalPlacesIfNecessary(mb)}MB`;
    }
    return `${addTwoDecimalPlacesIfNecessary(kb)}KB`;
};