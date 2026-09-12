const healthCheck = (req, res) => {
  res.status(200).json({
    success: true,
    data: null,
    message: 'Crypto Backend API is running',
  });
};

module.exports = { healthCheck };
