function addPlayer(game, socketId, name) {
    if(game.players.length < 4) {
        game.players.push({id: socketId, name, hand: [], ready: false});
        return {status: 'table', playerId: socketId};
    } else {
        game.waiting.push({id: socketId, name});
        return {status: 'waiting', playerId: socketId};
    }
}

function removePlayer(game, socketId) {
    game.players = game.players.filter(p => p.id !== socketId);
    game.waiting = game.waiting.filter(p => p.id !== socketId);
}

module.exports = { addPlayer, removePlayer };
