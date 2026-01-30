module.exports = function(socket, io) {
    socket.on('signal', ({to, data}) => {
        io.to(to).emit('signal', {from: socket.id, data});
    });
};
