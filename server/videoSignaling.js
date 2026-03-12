module.exports = function(socket, io) {
    socket.on('signal', ({to, data}) => {
        io.to(to).emit('signal', {from: socket.id, data});
    });
    
    // Relay offer requests between peers
    socket.on('requestOffer', ({ to }) => {
        io.to(to).emit('requestOffer', { from: socket.id });
    });
};
