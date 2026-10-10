#!/usr/bin/env python3
"""Read-only SHA-256 and JSON audit of the 13 solver banks. NOT mathematical certification.\nAudit trigger marker: 2026-10-10.\n"""
import hashlib, json, pathlib, sys
EXPECTED = dict(line.split() for line in """preflop.json 5e21f400c070abb02dc2afa907acfe117f15b22090f92e826efc9b39074b620b
postflop.json 8610e60ce7b9c1134b90b6c2562b29b730e515ffa551a423703e55ae91e02511
tournament.json 45af81e0ff3aec101defd095c684f84019b52f9ee76de0dc3924a1f22f9f96ce
reentry.json 0df1de58d0b182505582aef4140eabebdc2c93049033d5f9b8bf4c0fd9b5ac94
opponent-profile.json 4038b88cf754f420f64c5bf2f5c15d1624df62461f39e31275f71885ecc7dfdf
multiway-tournament.json eeb542b80d7fd0fe78e535b89b30f72b33ebea24fd4f5a5eca57a0baa61c530d
multiway-postflop.json 18227ff96db6a06b86119c076e891380b53c597a4c61ff3f4db031c97ca201d9
preflop-decisions.json bbbfc8634f73edf9b3c87f151f9e859fceb7f4b74582bfec5664d59c5af7b5d9
preflop-9max.json 5dda43c93240db95012b4b625a4ccfd9b9ff720e7f024d9f83bac3d277dcfb1e
preflop-multistack.json 1f52879fdcdc709bdb57c184b520d7f12084610322002a5987e7a8b8b4d75b92
preflop-hu.json f3d4e38e912ff0f10fb264ab38b9a33b2f572a65dbed95a18462e674eaf8cf06
texture-sizing.json 689e3b5a6cebe7d0cabb78e48ac904480264f020595b76cfb81fe06a70e3de01
line-bank.json 4cb193783c06fc92eb3dd3bf20ce43aa0abaa09ffb6c1f5d0b3ec166e5d810f4""".splitlines())
ROOT = pathlib.Path(__file__).resolve().parents[1]
def main():
    results = []
    for name, expected in EXPECTED.items():
        path = ROOT / 'data' / 'solver' / name
        item = {'bank':name,'expected_sha256':expected,'exists':path.is_file(),'sha256_match':False,'json_valid':False}
        if path.is_file():
            data=path.read_bytes()
            item['actual_sha256']=hashlib.sha256(data).hexdigest()
            item['sha256_match']=item['actual_sha256']==expected
            item['bytes']=len(data)
            try:
                payload=json.loads(data)
                item['json_valid']=True
                item['top_level_type']=type(payload).__name__
                item['top_level_items']=len(payload) if isinstance(payload,(list,dict)) else None
            except (ValueError,UnicodeError) as exc: item['error']=str(exc)
        results.append(item)
    report={'audit':'solver-bank-integrity','mathematical_solver_replay':False,'bank_count':len(results),
            'sha256_matched':sum(x['sha256_match'] for x in results),'all_passed':all(x['sha256_match'] and x['json_valid'] for x in results),'banks':results}
    out=ROOT/'audit-13-banks-result.json'
    out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({'sha256_matched':report['sha256_matched'],'bank_count':13,'all_passed':report['all_passed']}))
    return 0 if report['all_passed'] else 1
if __name__=='__main__':sys.exit(main())
