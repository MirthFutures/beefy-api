const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const OriginalGangster = require('../../../abis/OriginalGangster.json');
const ERC20 = require('../../../abis/ERC20.json');
const { getPrice } = require('../../../utils/getPrice');
const pools = require('../../../data/thugsLpPools.json');
const { compound } = require('../../../utils/compound');
const { lpTokenPrice } = require('../../../utils/lpTokens');

const web3 = new Web3(process.env.BSC_RPC_2 || process.env.BSC_RPC);

const getThugsLpApys = async () => {
  let apys = {};
  const gangster = '0x03edb31BeCc296d45670790c947150DAfEC2E238';

  let promises = [];
  pools.forEach(pool => promises.push(getPoolApy(gangster, pool)));
  const values = await Promise.all(promises);

  for (item of values) {
    apys = { ...apys, ...item };
  }

  return apys;
};

const getPoolApy = async (gangster, pool) => {
  const [yearlyRewardsInUsd, totalStakedInUsd] = await Promise.all([
    getYearlyRewardsInUsd(gangster, pool),
    getTotalStakedInUsd(gangster, pool),
  ]);
  const simpleApy = yearlyRewardsInUsd.dividedBy(totalStakedInUsd);
  console.log(pool.name, simpleApy.toString());
  const apy = compound(simpleApy, process.env.THUGS_LP_HPY, 1, 0.94);
  return { [pool.name]: apy };
};

const getYearlyRewardsInUsd = async (gangster, pool) => {
  const blockNum = await web3.eth.getBlockNumber();
  const gangsterContract = new web3.eth.Contract(OriginalGangster, gangster);

  const multiplier = new BigNumber(
    await gangsterContract.methods.getMultiplier(blockNum, blockNum + 1).call()
  );
  const blockRewards = new BigNumber(await gangsterContract.methods.drugsPerBlock().call());

  let { allocPoint } = await gangsterContract.methods.poolInfo(pool.poolId).call();
  allocPoint = new BigNumber(allocPoint);

  const totalAllocPoint = new BigNumber(await gangsterContract.methods.totalAllocPoint().call());
  const poolBlockRewards = blockRewards
    .times(multiplier)
    .times(allocPoint)
    .dividedBy(totalAllocPoint);

  const secondsPerBlock = 3;
  const secondsPerYear = 31536000;
  const yearlyRewards = poolBlockRewards.dividedBy(secondsPerBlock).times(secondsPerYear);

  const drugsPrice = await getPrice(
    'thugs',
    '0x339550404Ca4d831D12B1b2e4768869997390010_0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  );

  const yearlyRewardsInUsd = yearlyRewards.times(drugsPrice).dividedBy('1e18');

  return yearlyRewardsInUsd;
};

const getTotalStakedInUsd = async (gangster, pool) => {
  const tokenPairContract = await new web3.eth.Contract(ERC20, pool.address);
  const totalStaked = new BigNumber(await tokenPairContract.methods.balanceOf(gangster).call());
  const tokenPrice = await lpTokenPrice(pool);
  const totalStakedInUsd = totalStaked.times(tokenPrice).dividedBy('1e18');
  return totalStakedInUsd;
};

module.exports = getThugsLpApys;
