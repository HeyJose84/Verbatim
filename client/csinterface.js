/**
 * CSInterface - Minimal bridge for Adobe CEP 9-12+
 */
function CSInterface() {}

CSInterface.prototype.evalScript = function (script, callback) {
    if (callback === null || callback === undefined) callback = function () {};
    if (window.__adobe_cep__) {
        window.__adobe_cep__.evalScript(script, callback);
    } else {
        console.warn("window.__adobe_cep__ is not available in browser mode");
        callback(null);
    }
};

CSInterface.prototype.getSystemPath = function (pathType) {
    if (!window.__adobe_cep__) return "";
    var path = window.__adobe_cep__.getSystemPath(pathType);
    if (path && path.indexOf("file://") === 0) {
        path = decodeURIComponent(path.substring(7));
    }
    // On Windows, strip leading slash: /C:/... -> C:/...
    if (path) path = path.replace(/^\/([A-Za-z]:)/, "$1");
    return path;
};

CSInterface.prototype.getHostEnvironment = function () {
    if (!window.__adobe_cep__) return {};
    try {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment());
    } catch (e) {
        return {};
    }
};

CSInterface.prototype.closeExtension = function () {
    if (window.__adobe_cep__) window.__adobe_cep__.closeExtension();
};

var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};
