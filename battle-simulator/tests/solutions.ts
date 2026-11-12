// Reference armies found by tools/solve.ts: two different mixed answers per stage, each within budget,
// using only units unlocked at that point, and winning on three seeds. They prove every stage is fair.
import type { Army } from "../tools/balance-lib";

export const SOLUTIONS: Record<number, Army[]> = {
  1: [[["guardian",3],["spear",5],["archer",3]],[["guardian",3],["archer",7]]],
  2: [[["spear",7],["archer",6]],[["guardian",7],["archer",5]]],
  3: [[["zombie",7],["swordsman",1],["archer",6],["spear",7]],[["guardian",6],["archer",7],["swordsman",2]]],
  4: [[["skeleton",13],["archer",7]],[["zombie",17],["crossbow",4],["skeleton",5]]],
  5: [[["archer",11],["guardian",7]],[["archer",4],["guardian",2],["cleric",2],["crossbow",6]]],
  6: [[["guardian",5],["crossbow",3],["halberdier",2],["archer",3]],[["halberdier",4],["archer",3],["crossbow",3],["skeleton",4]]],
  7: [[["swordsman",4],["orc",5],["bonearcher",12]],[["cleric",2],["bonearcher",4],["archer",5],["swordsman",7]]],
  8: [[["archer",3],["orc",6],["cleric",4],["crossbow",4]],[["archer",7],["guardian",6],["crossbow",5]]],
  9: [[["javelin",3],["guardian",6],["crossbow",8]],[["javelin",13],["guardian",7]]],
  10: [[["bomber",5],["crossbow",3],["spear",10],["cleric",1]],[["guardian",7],["bonearcher",11],["crossbow",4]]],
  11: [[["zombie",26],["guardian",9],["bomber",5],["swordsman",4]],[["orc",17],["cleric",8]]],
  12: [[["guardian",15],["pirate",3],["shaman",3],["crossbow",4]],[["crossbow",9],["shaman",3],["guardian",13]]],
  13: [[["pirate",9],["cleric",3],["guardian",11]],[["bomber",6],["pirate",5],["monk",7],["cleric",3]]],
  14: [[["assassin",15],["berserker",12]],[["assassin",7],["archer",9],["crossbow",4],["orc",11]]],
  15: [[["assassin",10],["swordsman",13],["bomber",7]],[["mage",5],["assassin",12],["orc",11]]],
  16: [[["javelin",17],["guardian",8],["cleric",5]],[["bomber",7],["knight",4],["guardian",10]]],
  17: [[["paladin",3],["bonearcher",13],["knight",2],["elf",7]],[["cleric",4],["halberdier",7],["bomber",4],["assassin",11]]],
  18: [[["bomber",8],["paladin",3],["frost",10]],[["paladin",2],["spear",19],["guardian",12],["bomber",7]]],
  19: [[["cleric",11],["troll",3],["elf",10],["knight",2]],[["knight",4],["paladin",3],["vampire",4],["skeleton",33]]],
  20: [[["javelin",11],["paladin",3],["railgun",4],["knight",4]],[["cleric",8],["orc",18],["paladin",3],["monk",10]]],
  21: [[["monk",13],["knight",4],["guardian",16],["railgun",4]],[["paladin",6],["necromancer",3],["spear",16],["knight",6]]],
  // Outland expedition: found the same way, under the stage's own rules (eight of a kind at most, 80% budget).
  // Stage 30's two answers were written by hand from the stage's hint; random sampling found none in 260 tries.
  22: [[["paladin",2],["bomber",2],["tank",3],["frost",5],["spear",8],["sapper",5],["swordsman",6],["crossbow",5]],[["zeus",2],["sapper",8],["pirate",2],["railgun",2],["archer",8],["elf",3],["mage",3],["guardian",5]]],
  23: [[["frost",3],["giant",3],["zombie",8],["cleric",6],["mage",6],["catapult",1]],[["zeus",1],["cleric",8],["mage",6],["paladin",4],["orc",8]]],
  24: [[["mage",7],["swordsman",7],["giant",1],["javelin",6],["catapult",2],["pirate",4],["orc",6],["knight",4]],[["archer",8],["tank",5],["bomber",8],["crossbow",8],["guardian",8]]],
  25: [[["frost",6],["crossbow",6],["railgun",3],["guardian",8],["bomber",8],["swordsman",6],["tank",3]],[["zombie",8],["pirate",5],["berserker",5],["snakearcher",3],["cleric",8],["zeus",5]]],
  26: [[["paladin",1],["cleric",1],["orc",2],["skeleton",6],["frost",2],["pirate",1]],[["spear",2],["knight",1],["guardian",3],["hoplite",1],["mage",1],["assassin",2],["cleric",1]]],
  27: [[["zeus",2],["railgun",4],["frost",8],["guardian",8],["skeleton",8]],[["guardian",8],["javelin",8],["railgun",3],["tank",2],["elf",8],["mage",5]]],
  28: [[["railgun",3],["zeus",3],["giant",1],["elf",8],["harpooner",5],["pirate",4],["necromancer",8]],[["fanbearer",8],["hoplite",8],["giant",1],["spear",8],["necromancer",8],["railgun",7]]],
  29: [[["pirate",6],["mage",3],["guardian",8],["cleric",4],["shaman",4],["spear",4],["troll",1],["swordsman",8]],[["mage",7],["snakearcher",7],["archer",8],["guardian",8],["necromancer",4]]],
  30: [[["hoplite",8],["halberdier",8],["crossbow",8],["pirate",8],["mage",6],["cleric",5],["knight",4]],[["guardian",8],["spear",8],["halberdier",8],["crossbow",8],["railgun",4],["mage",6],["cleric",6],["knight",2]]],
};
