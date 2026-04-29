function errorHandler(err, req, res, _next) {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  if (err.code === 'P2002') {
    return res.status(409).json({ message: 'Duplicate value: ' + (err.meta?.target || 'unique field') });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'Record not found' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = { errorHandler };
