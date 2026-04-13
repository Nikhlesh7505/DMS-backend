let io = null;

const setSocketServer = (server) => {
  io = server;
  return io;
};

const getSocketServer = () => io;

const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};

const emitToRole = (role, event, payload) => {
  if (!io || !role) return;
  io.to(`role:${role}`).emit(event, payload);
};

module.exports = {
  setSocketServer,
  getSocketServer,
  emitToUser,
  emitToRole
};
