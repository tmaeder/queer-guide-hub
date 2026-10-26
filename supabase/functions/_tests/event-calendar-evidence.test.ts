import {assertEquals}from'https://deno.land/std@0.168.0/testing/asserts.ts'
import {calendarConfirmsCandidate,parseCalendarEvidence,type CalendarCandidate}from'../../../scripts/data-quality/collect-event-calendar-evidence.ts'
const candidate:CalendarCandidate={finding_id:'fixture',event_id:'fixture',external_id:'16:2027-01-26T11:00',data_source:'bka-theater',title:'Platypus',start_date:'2027-01-26T10:00:00Z',details:{page:'https://www.bka-theater.de/content_start.php?id=16&tid=4421'},expected_event_hash:'fixture',expected_finding_hash:'fixture'}
const entry={source_key:candidate.external_id,title:'PLATYPUS',start_date:'2027-01-26T11:00:00+01:00',url:'https://www.bka-theater.de/prg/16?tid=4421',performance_id:'4421'}
Deno.test('official calendar confirmation requires exact occurrence, date, title and performance page',()=>{
 assertEquals(calendarConfirmsCandidate(candidate,[entry]),entry)
 for(const changed of [{source_key:'other'},{start_date:'2027-01-27T11:00:00+01:00'},{title:'Another performance'},{performance_id:'4422'},{url:'https://other.example/prg/16?tid=4421'}]){
  assertEquals(calendarConfirmsCandidate(candidate,[{...entry,...changed}]),null)
 }
 assertEquals(calendarConfirmsCandidate(candidate,[entry,entry]),null)
 assertEquals(calendarConfirmsCandidate({...candidate,details:{page:'https://www.bka-theater.de/content_start.php?id=17&tid=4421'}},[entry]),null)
})
Deno.test('edited display titles require the original captured source title to agree',()=>{
 assertEquals(calendarConfirmsCandidate({...candidate,title:'An edited display title',source_title:'Platypus'},[entry]),entry)
 assertEquals(calendarConfirmsCandidate({...candidate,title:'An edited display title'},[entry]),null)
})
Deno.test('HAZ evidence uses explicit UTC dates and rejects invalid calendar days',()=>{
 const body=JSON.stringify({events:[{slug:'book-club-6',title:'Books &amp; community',url:'https://haz.ch/event/book-club-6/',utc_start_date:'2026-12-02 18:15:00'},
  {slug:'broken',url:'https://haz.ch/event/broken/',title:'Broken',utc_start_date:'2026-02-30 18:15:00'}]})
 const parsed=parseCalendarEvidence('haz-ch',body)
 assertEquals(parsed.length,1);assertEquals(parsed[0].start_date,'2026-12-02T18:15:00.000Z');assertEquals(parsed[0].title,'Books & community')
 const row={...candidate,data_source:'haz-ch' as const,external_id:'book-club-6',title:'Books & community',start_date:'2026-12-02T18:15:00Z',details:{page:'https://haz.ch/event/book-club-6/'}}
 assertEquals(calendarConfirmsCandidate(row,parsed),parsed[0])
 assertEquals(calendarConfirmsCandidate({...row,details:{page:'https://haz.ch/event/another-date/'}},parsed),null)
})
Deno.test('Lab.oratory generic series pages never choose an occurrence by title alone',()=>{
 const row={...candidate,data_source:'lab-oratory'as const,external_id:'occurrence-id',title:'Naked Sunday',start_date:'2026-12-06T15:00:00Z',details:{page:'https://www.lab-oratory.de/naked-sunday'}}
 const event={source_key:'occurrence-id',title:'NAKED SUNDAY',start_date:'2026-12-06T16:00:00+01:00',url:'https://www.lab-oratory.de/naked-sunday'}
 assertEquals(calendarConfirmsCandidate(row,[event]),event)
 assertEquals(calendarConfirmsCandidate(row,[{...event,source_key:'other-date'}]),null)
})
