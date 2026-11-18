module.exports = function apiErrorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const isMalformedJson = error && error.type === 'entity.parse.failed';
    const isPayloadTooLarge = error && error.type === 'entity.too.large';

    if (isMalformedJson) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON request body.'
        });
    }

    if (isPayloadTooLarge) {
        return res.status(413).json({
            success: false,
            message: 'Request body is too large.'
        });
    }

    console.error('Unhandled API error:', error && error.message ? error.message : 'Unknown error');

    return res.status(500).json({
        success: false,
        message: 'An unexpected server error occurred.'
    });
};
