import type {RuntimeForestChapterManifest} from '../content/runtime-forest-chapter-manifest';
import type {AllocationMode} from '../world/forest-water-allocation';
export const ALLOCATION_NAMES:Record<AllocationMode,string>={settlement_priority:'聚落优先',wetland_priority:'湿地优先',road_trade_priority:'商路优先'};
const effectText:Record<string,string>={
 resident_water_stable:'聚落饮水稳定',crops_stable:'庄稼获得稳定灌溉',
 wetland_decline_continues:'湿地继续退水',creature_migration_pressure:'动物面临更大的迁徙压力',
 wetland_recovery_started:'湿地开始恢复',creature_habitat_stable:'栖息地供水稳定',
 settlement_rationing:'聚落实行用水配给',local_food_price_pressure:'本地食物面临涨价压力',
 medicine_salt_metal_route_open:'药材、盐与金属补给线恢复供水',external_news_route_open:'外来消息的商路联系条件恢复',
 settlement_minimum_supply:'聚落仅获最低供水',wetland_minimum_supply:'湿地仅获最低供水',
};
export function allocationEffects(chapter:RuntimeForestChapterManifest,mode:AllocationMode):readonly string[]{
 return [...chapter.allocation.benefitIdsByMode[mode]!,...chapter.allocation.costIdsByMode[mode]!];
}
export function allocationDescription(chapter:RuntimeForestChapterManifest,mode:AllocationMode):string{
 const text=(ids:readonly string[])=>ids.map(id=>{if(!effectText[id])throw Error('配水后果缺少说明：'+id);return effectText[id];}).join('、');
 return ALLOCATION_NAMES[mode]+'。收益：'+text(chapter.allocation.benefitIdsByMode[mode]!)+
  '。代价：'+text(chapter.allocation.costIdsByMode[mode]!)+'。';
}
