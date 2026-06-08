function createDockVisibilityController() {
    let active = false;

    async function showDock() {
        active = true;
        return {
            ok: true,
            changed: false,
            restoreValue: null
        };
    }

    function restoreDock() {
        active = false;
        return Promise.resolve();
    }

    return {
        restoreDock,
        showDock
    };
}

module.exports = {
    createDockVisibilityController
};
