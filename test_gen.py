"""Quick test to verify the timetable generator works."""
import json
import random
import copy
import time
import os
from typing import Dict, List, Any, Optional, Tuple


class TimetableGenerator:
    def __init__(self, data: Dict[str, Any]):
        self.departments: List[Dict[str, Any]] = data.get('departments', [])
        self.num_days: int = int(data.get('numDays', 5))
        self.num_slots: int = int(data.get('numSlots', 6))
        self.schedule_mode: str = data.get('scheduleMode', 'class')
        self.sections_per_cluster: int = int(data.get('sectionsPerCluster', 2))
        self.section_cluster_map: Dict[str, int] = {}
        self.subjects: List[Dict[str, Any]] = data.get('subjects', [])
        self.teachers: List[Dict[str, Any]] = data.get('teachers', [])
        self.rooms: List[Dict[str, Any]] = data.get('rooms', [])
        self.constraints: Dict[str, Any] = data.get('constraints', {})
        self.lunch_slot: Optional[int] = int(self.num_slots // 2) if self.constraints.get('fixedLunch', False) else None
        
        # New constraints
        self.enforce_first_period: bool = self.constraints.get('enforceFirstPeriod', False)
        self.max_consecutive_classes: int = int(self.constraints.get('maxConsecutiveClasses', 3))

        # Build helper maps
        self.subject_map: Dict[str, Dict[str, Any]] = {str(s.get('name', '')): s for s in self.subjects}
        self.teacher_subject_map: Dict[str, List[Dict[str, Any]]] = {}
        for t in self.teachers:
            t_name = str(t.get('name', '')).strip()
            t_id = str(t.get('id', '')).strip()
            if not t_id:
                t_id = f"T-{random.randint(1000, 9999)}"
            t_uid = f"{t_name} ({t_id})" if t_name else t_id
            t_cluster = int(t.get('cluster', 1))
            
            for subj in t.get('subjects', []):
                subj_str = str(subj)
                if subj_str not in self.teacher_subject_map:
                    self.teacher_subject_map[subj_str] = []
                self.teacher_subject_map[subj_str].append({
                    'uid': t_uid,
                    'cluster': t_cluster
                })

        self.classrooms = [r for r in self.rooms if r.get('type', 'Classroom') == 'Classroom']
        self.labs = [r for r in self.rooms if r.get('type', 'Classroom') == 'Lab']

    def generate(self) -> Dict[str, Any]:
        results: Dict[str, Any] = {}
        teacher_schedule: Dict[str, Dict[Tuple[int, int], str]] = {}
        room_schedule: Dict[str, Dict[Tuple[int, int], str]] = {}

        sections: List[str] = []
        self.section_cluster_map.clear()
        
        global_sec_idx: int = 0
        for dept in self.departments:
            dept_name = dept['name']
            num_sections = int(dept.get('sections', 1))

            for sec_idx in range(num_sections):
                sec_label = chr(65 + sec_idx)
                section_id = f"{dept_name} - Section {sec_label}"
                sections.append(section_id)
                
                if self.schedule_mode == 'cluster':
                    divisor = self.sections_per_cluster if self.sections_per_cluster > 0 else 1
                    cluster_id = (int(global_sec_idx) // divisor) + 1
                else:
                    cluster_id = 1
                    
                self.section_cluster_map[section_id] = cluster_id
                global_sec_idx += 1

        for section_id in sections:
            timetable = self._generate_section_timetable(
                section_id, teacher_schedule, room_schedule
            )
            results[section_id] = timetable

        teacher_timetables = self._build_teacher_timetables(results)

        return {
            'sectionTimetables': results,
            'teacherTimetables': teacher_timetables
        }

    def _generate_section_timetable(self, section_id, teacher_schedule, room_schedule):
        grid = [[None for _ in range(self.num_slots)] for _ in range(self.num_days)]

        assignments = []
        for subj in self.subjects:
            hours = subj.get('hours', 1)
            is_lab = subj.get('name', '').lower().find('lab') != -1
            for _ in range(hours):
                assignments.append({
                    'subject': subj['name'],
                    'is_lab': is_lab,
                })

        random.shuffle(assignments)

        # Try to place each assignment with backtracking (time-limited)
        attempt_counter = [0]
        start_time = time.time()
        print(f"  Attempting backtrack for {section_id} ({len(assignments)} assignments)...")
        success = self._backtrack_fill(
            grid, assignments, 0, section_id, teacher_schedule, room_schedule,
            max_attempts=10000, attempt_counter=attempt_counter, start_time=start_time, time_limit=10.0
        )
        print(f"  Backtrack {'succeeded' if success else 'failed'} after {attempt_counter[0]} attempts, {time.time()-start_time:.2f}s")

        if not success:
            grid = [[None for _ in range(self.num_slots)] for _ in range(self.num_days)]
            print(f"  Falling back to greedy...")
            self._greedy_fill(grid, assignments, section_id, teacher_schedule, room_schedule)
            print(f"  Greedy done.")

        formatted = []
        for day_idx in range(self.num_days):
            day_data = []
            for slot_idx in range(self.num_slots):
                cell = grid[day_idx][slot_idx]
                if cell is None:
                    if self.lunch_slot is not None and slot_idx == self.lunch_slot:
                        day_data.append({'subject': 'LUNCH BREAK', 'teacher': '', 'room': '', 'isLunch': True})
                    else:
                        day_data.append({'subject': 'Free', 'teacher': '', 'room': '', 'isFree': True})
                else:
                    day_data.append(cell)
            formatted.append(day_data)

        return formatted

    def _backtrack_fill(self, grid, assignments, idx, section_id, teacher_schedule, room_schedule, max_attempts=5000, attempt_counter=None, start_time=None, time_limit=5.0):
        if idx >= len(assignments):
            # Final Check: First period must not be empty if enforced
            if self.enforce_first_period:
                for d in range(self.num_days):
                    if grid[d][0] is None:
                        return False
            return True

        if attempt_counter is not None:
            attempt_counter[0] += 1
            if attempt_counter[0] > max_attempts:
                return False

        if start_time is not None and (time.time() - start_time) > time_limit:
            return False

        assignment = assignments[idx]
        subject_name = assignment['subject']
        is_lab = assignment['is_lab']

        # Heuristic: If enforcing first period, try slot 0 first
        positions = []
        first_slots = []
        other_slots = []
        for d in range(self.num_days):
            for s in range(self.num_slots):
                if s == 0:
                    first_slots.append((d, s))
                else:
                    other_slots.append((d, s))
        
        random.shuffle(first_slots)
        random.shuffle(other_slots)
        
        if self.enforce_first_period:
            positions = first_slots + other_slots
        else:
            positions = first_slots + other_slots
            random.shuffle(positions)

        for (d, s) in positions:
            if grid[d][s] is not None:
                continue
            if self.lunch_slot is not None and s == self.lunch_slot:
                continue

            if is_lab and self.constraints.get('labConsecutive', False):
                if s + 1 >= self.num_slots or grid[d][s + 1] is not None:
                    continue
                if self.lunch_slot is not None and s + 1 == self.lunch_slot:
                    continue

            sec_cluster = self.section_cluster_map.get(section_id, 1)
            all_teachers_for_subj = self.teacher_subject_map.get(subject_name, [])
            
            if self.schedule_mode == 'cluster':
                available_teachers = [t['uid'] for t in all_teachers_for_subj if t['cluster'] == sec_cluster]
            else:
                available_teachers = [t['uid'] for t in all_teachers_for_subj]

            if not available_teachers:
                available_teachers = ['TBD']

            random.shuffle(available_teachers)
            teacher_found = None
            for t_name in available_teachers:
                if self.constraints.get('avoidTeacherClash', True):
                    if t_name in teacher_schedule and (d, s) in teacher_schedule[t_name]:
                        continue
                    if is_lab and self.constraints.get('labConsecutive', False):
                        if t_name in teacher_schedule and (d, s + 1) in teacher_schedule[t_name]:
                            continue
                    
                # New Constraint: Professor Breaks (Consecutive classes limit)
                if self.constraints.get('teacherBreaks', False):
                    # Check consecutive classes if this slot was assigned to this teacher
                    consecutive = 1
                    # Check backward
                    curr_s = s - 1
                    while curr_s >= 0:
                        if t_name in teacher_schedule and (d, curr_s) in teacher_schedule[t_name]:
                            consecutive += 1
                        elif grid[d][curr_s] is not None and grid[d][curr_s]['teacher'] == t_name:
                            consecutive += 1
                        else:
                            break
                        curr_s -= 1
                    # Check forward
                    curr_s = s + 1
                    while curr_s < self.num_slots:
                        if t_name in teacher_schedule and (d, curr_s) in teacher_schedule[t_name]:
                            consecutive += 1
                        elif grid[d][curr_s] is not None and grid[d][curr_s]['teacher'] == t_name:
                            consecutive += 1
                        else:
                            break
                        curr_s += 1
                    
                    if consecutive > self.max_consecutive_classes:
                        continue

                teacher_found = t_name
                break

            if teacher_found is None:
                continue

            room_pool = self.labs if is_lab else self.classrooms
            if not room_pool:
                room_pool = self.rooms if self.rooms else [{'name': 'Room 1'}]
            random.shuffle(room_pool)
            room_found = None
            for room in room_pool:
                r_name = room['name']
                if self.constraints.get('avoidRoomClash', True):
                    if r_name in room_schedule and (d, s) in room_schedule[r_name]:
                        continue
                    if is_lab and self.constraints.get('labConsecutive', False):
                        if r_name in room_schedule and (d, s + 1) in room_schedule[r_name]:
                            continue
                room_found = r_name
                break

            if room_found is None:
                continue

            cell = {
                'subject': subject_name,
                'teacher': teacher_found,
                'room': room_found,
                'isLab': is_lab
            }
            grid[d][s] = cell
            if teacher_found not in teacher_schedule:
                teacher_schedule[teacher_found] = {}
            teacher_schedule[teacher_found][(d, s)] = section_id
            
            if room_found not in room_schedule:
                room_schedule[room_found] = {}
            room_schedule[room_found][(d, s)] = section_id

            if is_lab and self.constraints.get('labConsecutive', False):
                grid[d][s + 1] = cell
                teacher_schedule[teacher_found][(d, s + 1)] = section_id
                room_schedule[room_found][(d, s + 1)] = section_id

            if self._backtrack_fill(grid, assignments, idx + 1, section_id, teacher_schedule, room_schedule, max_attempts, attempt_counter, start_time, time_limit):
                return True

            grid[d][s] = None
            del teacher_schedule[teacher_found][(d, s)]
            del room_schedule[room_found][(d, s)]
            if is_lab and self.constraints.get('labConsecutive', False):
                grid[d][s + 1] = None
                del teacher_schedule[teacher_found][(d, s + 1)]
                del room_schedule[room_found][(d, s + 1)]

        return False

    def _greedy_fill(self, grid, assignments, section_id, teacher_schedule, room_schedule):
        for assignment in assignments:
            subject_name = assignment['subject']
            is_lab = assignment['is_lab']
            placed = False

            # Heuristic for greedy: try to fill slot 0 first if enforced
            search_slots = []
            if self.enforce_first_period:
                for d in range(self.num_days): search_slots.append((d, 0))
                for d in range(self.num_days):
                    for s in range(1, self.num_slots): search_slots.append((d, s))
            else:
                for d in range(self.num_days):
                    for s in range(self.num_slots): search_slots.append((d, s))

            for d, s in search_slots:
                if placed:
                    break
                    if grid[d][s] is not None:
                        continue
                    if self.lunch_slot is not None and s == self.lunch_slot:
                        continue

                    sec_cluster = self.section_cluster_map.get(section_id, 1)
                    all_teachers_for_subj = self.teacher_subject_map.get(subject_name, [])
                    if self.schedule_mode == 'cluster':
                        available_teachers = [t['uid'] for t in all_teachers_for_subj if t['cluster'] == sec_cluster]
                    else:
                        available_teachers = [t['uid'] for t in all_teachers_for_subj]

                    teacher_found = available_teachers[0] if available_teachers else 'TBD'

                    room_pool = self.labs if is_lab else self.classrooms
                    if not room_pool:
                        room_pool = self.rooms if self.rooms else [{'name': 'Room 1'}]
                    room_found = room_pool[0]['name']

                    cell = {
                        'subject': subject_name,
                        'teacher': teacher_found,
                        'room': room_found,
                        'isLab': is_lab
                    }
                    grid[d][s] = cell
                    if teacher_found not in teacher_schedule:
                        teacher_schedule[teacher_found] = {}
                    teacher_schedule[teacher_found][(d, s)] = section_id
                    
                    if room_found not in room_schedule:
                        room_schedule[room_found] = {}
                    room_schedule[room_found][(d, s)] = section_id
                    placed = True
                    break

    def _build_teacher_timetables(self, section_timetables):
        teacher_tt = {}
        for section_id, t_grid in section_timetables.items():
            for day_idx, day_data in enumerate(t_grid):
                for slot_idx, cell in enumerate(day_data):
                    if cell and cell.get('teacher'):
                        t_name = str(cell['teacher'])
                        if t_name not in teacher_tt:
                            teacher_tt[t_name] = [[None for _ in range(self.num_slots)] for _ in range(self.num_days)]
                        if teacher_tt[t_name][day_idx][slot_idx] is None:
                            teacher_tt[t_name][day_idx][slot_idx] = {
                                'subject': cell['subject'],
                                'section': section_id,
                                'room': cell.get('room', ''),
                            }

        formatted = {}
        for t_name, fmt_grid_in in teacher_tt.items():
            fmt_grid = []
            for day_idx in range(self.num_days):
                day_data = []
                for slot_idx in range(self.num_slots):
                    cell = fmt_grid_in[day_idx][slot_idx]
                    if cell is None:
                        day_data.append({'subject': 'Free', 'section': '', 'room': '', 'isFree': True})
                    else:
                        day_data.append(cell)
                fmt_grid.append(day_data)
            formatted[t_name] = fmt_grid

        return formatted


if __name__ == '__main__':
    data = {
        'scheduleMode': 'class',
        'sectionsPerCluster': 2,
        'departments': [{'name': 'CS', 'sections': 1}],
        'numDays': 5,
        'numSlots': 8,
        'subjects': [{'name': 'Math', 'hours': 15}],
        'teachers': [
            {'name': 'Dr Smith', 'id': 'T1', 'subjects': ['Math'], 'cluster': 1},
        ],
        'rooms': [{'name': 'Room 101', 'type': 'Classroom'}],
        'constraints': {
            'avoidTeacherClash': True,
            'avoidRoomClash': True,
            'fixedLunch': True,
            'labConsecutive': False,
            'enforceFirstPeriod': True,
            'teacherBreaks': True,
            'maxConsecutiveClasses': 2,
        },
    }

    print('Test: Moderate consecutive limit (max 2)...')
    start = time.time()
    gen = TimetableGenerator(data)
    result = gen.generate()
    elapsed = time.time() - start
    print(f'Done in {elapsed:.2f}s')
    print(f'Sections: {list(result["sectionTimetables"].keys())}')
    print(f'Teachers: {list(result["teacherTimetables"].keys())}')
    
    # Print sample
    for sec, grid in result['sectionTimetables'].items():
        print(f'\n{sec}:')
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        for d_idx, day in enumerate(grid):
            slots = []
            for cell in day:
                if cell.get('isFree'): slots.append('Free')
                elif cell.get('isLunch'): slots.append('LUNCH')
                else: slots.append(cell['subject'][:8])
            print(f'  {days[d_idx]}: {" | ".join(slots)}')
    
    print('\nSUCCESS!')
