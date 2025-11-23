export default {
  xp: {
    minuteLimit: 5,
    dailyLimit: 500
  },
  spam: {
    maxMsgsPerWindow: 7,
    windowSeconds: 10
  },
  shop: {
    items: [
      { id: 'box_random', name: 'Box Random', price: 100, type: 'box' },
      { id: 'capcut_7d', name: 'CapCut 7 ngày', price: 700, type: 'capcut' },
      { id: 'canvaedu_30d', name: 'CanvaEdu 30 ngày', price: 1000, type: 'canva_edu' },
      { id: 'canvapro_30d', name: 'CanvaPro 30 ngày', price: 1200, type: 'canva_pro' }
    ],
    randomRewards: [
      { type: 'capcut', chance: 5 },
      { type: 'canva_edu', chance: 10 },
      { type: 'canva_pro', chance: 15 },
      { type: 'nothing', chance: 75 }
    ]
  }
};
