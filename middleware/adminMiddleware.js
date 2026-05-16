exports.isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    return res.status(403).render('pages/login', { error: "Accès refusé. Vous devez être administrateur." });
};