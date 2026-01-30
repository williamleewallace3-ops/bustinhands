// utils.js
// Chinese Poker hand validation & comparison logic

const SUIT_RANK = { 'C': 1, 'S': 2, 'H': 3, 'D': 4 };
const RANK_ORDER = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];

// Return numerical value for comparison
function rankValue(rank) {
    return RANK_ORDER.indexOf(rank);
}

// Check if a 5-card hand is a straight
function isStraight(cards) {
    if(cards.length !== 5) return false;
    let values = cards.map(c => rankValue(c.rank)).sort((a,b)=>a-b);
    // Special case: 2 low or 2 high
    if(values.includes(12)) { // '2'
        // 2 can be high or low
        // Check low straight: 2,3,4,5,6
        let lowStraight = [0,1,2,3,12]; // 3,4,5,6,2
        if(values.join(',') === lowStraight.join(',')) return true;
    }
    // normal straight
    for(let i=1;i<values.length;i++){
        if(values[i] !== values[i-1]+1) return false;
    }
    return true;
}

// Determine hand type
function getHandType(cards) {
    if(cards.length === 1) return 'single';
    if(cards.length === 2 && cards[0].rank === cards[1].rank) return 'pair';
    if(cards.length === 3 && cards.every(c=>c.rank===cards[0].rank)) return 'triple';
    if(cards.length === 5) {
        // Full house, flush, straight, etc.
        if(isStraight(cards)) return 'straight';
        let ranks = {};
        cards.forEach(c=>ranks[c.rank]=(ranks[c.rank]||0)+1);
        let counts = Object.values(ranks).sort((a,b)=>b-a);
        if(counts[0]===3 && counts[1]===2) return 'fullhouse';
        if(counts[0]===4) return 'fourkind';
        if(counts[0]===3) return 'threekind';
        if(counts[0]===2 && counts[1]===2) return 'twopair'; // not allowed
        if(counts[0]===2) return 'pair';
        return 'highcard';
    }
    return 'invalid';
}

// Compare two hands of same type
function compareHands(handA, handB) {
    if(handA.length !== handB.length) return null;

    let type = getHandType(handA);
    if(type !== getHandType(handB)) return null;

    // Single, Pair, Triple
    if(['single','pair','triple'].includes(type)){
        // Compare rank
        let aValue = rankValue(handA[0].rank);
        let bValue = rankValue(handB[0].rank);
        if(aValue !== bValue) return aValue - bValue;
        // Tie: use highest suit
        let aSuit = Math.max(...handA.map(c=>SUIT_RANK[c.suit]));
        let bSuit = Math.max(...handB.map(c=>SUIT_RANK[c.suit]));
        return aSuit - bSuit;
    }

    // 5-card poker hands
    // For simplicity, compare highest rank first, then suit
    let aSorted = [...handA].sort((a,b)=>rankValue(b.rank)-rankValue(a.rank));
    let bSorted = [...handB].sort((a,b)=>rankValue(b.rank)-rankValue(a.rank));
    for(let i=0;i<5;i++){
        let diff = rankValue(aSorted[i].rank) - rankValue(bSorted[i].rank);
        if(diff!==0) return diff;
    }
    // If tied, compare suits of highest card
    let aSuit = SUIT_RANK[aSorted[0].suit];
    let bSuit = SUIT_RANK[bSorted[0].suit];
    return aSuit - bSuit;
}

// Validate a hand against previous hand on table
function rankHand(cards, table) {
    if(!cards || cards.length===0) return false;
    let type = getHandType(cards);
    if(type==='invalid') return false;

    if(table.length===0) return true; // can play any hand first

    let last = table[table.length-1].cards;
    let cmp = compareHands(cards, last);
    return cmp > 0;
}

// Hand type hierarchy for determining loser
const HAND_TYPE_RANK = {
    'single': 1,
    'pair': 2,
    'threekind': 3,
    'straight': 4,
    'flush': 5,
    'fullhouse': 6,
    'fourkind': 7,
    'straightflush': 8
};

// Find all possible 5-card combinations
function getCombinations(arr, k) {
    if (k === 1) return arr.map(el => [el]);
    if (k === arr.length) return [arr];
    
    let result = [];
    for (let i = 0; i <= arr.length - k; i++) {
        let head = arr[i];
        let tailCombs = getCombinations(arr.slice(i + 1), k - 1);
        for (let comb of tailCombs) {
            result.push([head, ...comb]);
        }
    }
    return result;
}

// Check if 5 cards form a flush
function isFlush(cards) {
    if (cards.length !== 5) return false;
    return cards.every(c => c.suit === cards[0].suit);
}

// Get enhanced hand type (includes flush detection)
function getEnhancedHandType(cards) {
    if (cards.length === 5) {
        let isStraightHand = isStraight(cards);
        let isFlushHand = isFlush(cards);
        
        if (isStraightHand && isFlushHand) return 'straightflush';
        if (isFlushHand) return 'flush';
        if (isStraightHand) return 'straight';
        
        let ranks = {};
        cards.forEach(c => ranks[c.rank] = (ranks[c.rank] || 0) + 1);
        let counts = Object.values(ranks).sort((a, b) => b - a);
        
        if (counts[0] === 4) return 'fourkind';
        if (counts[0] === 3 && counts[1] === 2) return 'fullhouse';
        if (counts[0] === 3) return 'threekind';
        if (counts[0] === 2 && counts[1] === 2) return 'twopair';
        if (counts[0] === 2) return 'pair';
        return 'single';
    }
    return getHandType(cards);
}

// Find the best possible hand from remaining cards
function findBestHand(cards) {
    if (!cards || cards.length === 0) return null;
    
    let bestHand = null;
    let bestType = 'single';
    let bestRank = -1;
    let bestSuit = 0;
    
    // Try 5-card hands
    if (cards.length >= 5) {
        let fiveCardCombs = getCombinations(cards, 5);
        for (let hand of fiveCardCombs) {
            let type = getEnhancedHandType(hand);
            let typeRank = HAND_TYPE_RANK[type] || 0;
            
            if (typeRank > HAND_TYPE_RANK[bestType]) {
                bestHand = hand;
                bestType = type;
                // Get highest card rank and suit
                let sorted = [...hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
                bestRank = rankValue(sorted[0].rank);
                bestSuit = SUIT_RANK[sorted[0].suit];
            } else if (typeRank === HAND_TYPE_RANK[bestType]) {
                // Compare ranks
                let sorted = [...hand].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
                let thisRank = rankValue(sorted[0].rank);
                let thisSuit = SUIT_RANK[sorted[0].suit];
                
                if (thisRank > bestRank || (thisRank === bestRank && thisSuit > bestSuit)) {
                    bestHand = hand;
                    bestRank = thisRank;
                    bestSuit = thisSuit;
                }
            }
        }
    }
    
    // Try 4 of a kind (from 4 cards)
    if (cards.length >= 4) {
        let fourCardCombs = getCombinations(cards, 4);
        for (let hand of fourCardCombs) {
            if (hand.every(c => c.rank === hand[0].rank)) {
                let typeRank = HAND_TYPE_RANK['fourkind'];
                if (typeRank > HAND_TYPE_RANK[bestType]) {
                    bestHand = hand;
                    bestType = 'fourkind';
                    bestRank = rankValue(hand[0].rank);
                    bestSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                } else if (typeRank === HAND_TYPE_RANK[bestType]) {
                    // Compare ranks if both are 4-of-a-kind
                    let thisRank = rankValue(hand[0].rank);
                    let thisSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                    if (thisRank > bestRank || (thisRank === bestRank && thisSuit > bestSuit)) {
                        bestHand = hand;
                        bestRank = thisRank;
                        bestSuit = thisSuit;
                    }
                }
            }
        }
    }
    
    // Try 3 of a kind
    if (cards.length >= 3) {
        let threeCardCombs = getCombinations(cards, 3);
        for (let hand of threeCardCombs) {
            if (hand.every(c => c.rank === hand[0].rank)) {
                let typeRank = HAND_TYPE_RANK['threekind'];
                if (typeRank > HAND_TYPE_RANK[bestType]) {
                    bestHand = hand;
                    bestType = 'threekind';
                    bestRank = rankValue(hand[0].rank);
                    bestSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                } else if (typeRank === HAND_TYPE_RANK[bestType]) {
                    let thisRank = rankValue(hand[0].rank);
                    let thisSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                    if (thisRank > bestRank || (thisRank === bestRank && thisSuit > bestSuit)) {
                        bestHand = hand;
                        bestRank = thisRank;
                        bestSuit = thisSuit;
                    }
                }
            }
        }
    }
    
    // Try pairs
    if (cards.length >= 2) {
        let twoCardCombs = getCombinations(cards, 2);
        for (let hand of twoCardCombs) {
            if (hand[0].rank === hand[1].rank) {
                let typeRank = HAND_TYPE_RANK['pair'];
                if (typeRank > HAND_TYPE_RANK[bestType]) {
                    bestHand = hand;
                    bestType = 'pair';
                    bestRank = rankValue(hand[0].rank);
                    bestSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                } else if (typeRank === HAND_TYPE_RANK[bestType]) {
                    let thisRank = rankValue(hand[0].rank);
                    let thisSuit = Math.max(...hand.map(c => SUIT_RANK[c.suit]));
                    if (thisRank > bestRank || (thisRank === bestRank && thisSuit > bestSuit)) {
                        bestHand = hand;
                        bestRank = thisRank;
                        bestSuit = thisSuit;
                    }
                }
            }
        }
    }
    
    // Fall back to highest single card
    if (!bestHand) {
        let sorted = [...cards].sort((a, b) => {
            let rankDiff = rankValue(b.rank) - rankValue(a.rank);
            if (rankDiff !== 0) return rankDiff;
            return SUIT_RANK[b.suit] - SUIT_RANK[a.suit];
        });
        bestHand = [sorted[0]];
        bestType = 'single';
        bestRank = rankValue(sorted[0].rank);
        bestSuit = SUIT_RANK[sorted[0].suit];
    }
    
    return { hand: bestHand, type: bestType, rank: bestRank, suit: bestSuit };
}

module.exports = { rankHand, compareHands, getHandType, findBestHand, HAND_TYPE_RANK, rankValue, SUIT_RANK };
