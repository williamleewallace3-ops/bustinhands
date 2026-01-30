const { rankHand, compareHands } = require('./utils');

function createGame(roomId) {
    return {
        roomId,
        players: [], // active players at table
        waiting: [], // waiting room queue
        table: [],   // played cards
        turnIndex: 0,
        started: false
    };
}

function playerReady(game, playerId, io) {
    let player = game.players.find(p => p.id === playerId);
    if(player) player.ready = true;

    if(game.players.every(p => p.ready)) {
        game.started = true;
        // Find 3 of Clubs holder
        game.turnIndex = game.players.findIndex(p => p.hand.some(c => c.rank === '3' && c.suit === 'clubs'));
        io.to(game.roomId).emit('gameStart', {turnIndex: game.turnIndex, game});
    }
}

function playHand(game, playerId, cards, io) {
    let player = game.players[game.turnIndex];
    if(player.id !== playerId) return;

    // Validate hand
    let valid = rankHand(cards, game.table);
    if(!valid) {
        io.to(playerId).emit('invalidHand');
        return;
    }

    // Remove cards from player hand
    player.hand = player.hand.filter(c => !cards.includes(c.id));
    game.table.push({playerId, cards});

    // Check win
    if(player.hand.length === 0) {
        io.to(game.roomId).emit('gameEnd', {winner: playerId});
        return;
    }

    // Advance turn
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    io.to(game.roomId).emit('updateTurn', game.turnIndex);
    io.to(game.roomId).emit('updateTable', game.table);
}

function passTurn(game, playerId, io) {
    if(game.players[game.turnIndex].id !== playerId) return;
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    io.to(game.roomId).emit('updateTurn', game.turnIndex);
}

module.exports = {
    createGame,
    playerReady,
    playHand,
    passTurn
};
