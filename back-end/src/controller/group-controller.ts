import { NextFunction, Request, Response } from "express"
import { getRepository, In, MoreThanOrEqual } from "typeorm"
import { GroupStudent } from "../entity/group-student.entity";
import { Group } from "../entity/group.entity"
import { Roll } from "../entity/roll.entity"
import { StudentRollState } from "../entity/student-roll-state.entity";
import { CreateGroupInput, UpdateGroupInput, UpdateGroupAfterFilterInput } from "../interface/group.interface";
import { map } from "lodash"
import { CreateGroupStudentInput } from "../interface/group-student.interface";


export class GroupController {
  private groupRepository = getRepository(Group);
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRollStateRepository = getRepository(StudentRollState)
  private rollRepository = getRepository(Roll)



  async allGroups(request: Request, response: Response, next: NextFunction) {
    return this.groupRepository.find()
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request
    const createGroupInput: CreateGroupInput = {
      name: params.name,
      incidents: params.incidents,
      ltmt: params.ltmt,
      roll_states: params.roll_states,
      number_of_weeks: params.number_of_weeks
    }
    const group = new Group()
    group.prepareToCreate(createGroupInput)
    return this.groupRepository.save(group)
  }

  async updateGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request
    const group = await this.groupRepository.findOne(params.id)
    const updateGroupInput: UpdateGroupInput = {
      id: params.id,
      name: params.name,
      incidents: params.incidents,
      ltmt: params.ltmt,
      roll_states: params.roll_states,
      number_of_weeks: params.number_of_weeks
    }
    group.prepareToUpdate(updateGroupInput)
    return this.groupRepository.save(updateGroupInput, { reload: true })
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    let groupToRemove = await this.groupRepository.findOne(request.params.id)
    return await this.groupRepository.remove(groupToRemove)
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    const { query } = request
    return
  }


  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    // Task 2:

    // 1. Clear out the groups (delete all the students from the groups)
    this.groupStudentRepository.clear()

    // 2. For each group, query the student rolls to see which students match the filter for the group
    const groups = await this.groupRepository.find()
    for(let group of groups){
      const roll_states = group.roll_states.split(',')
      const numberOfWeeks = group.number_of_weeks
      const numberOfDays = numberOfWeeks * 7
      const pastDate = new Date(new Date().setDate(new Date().getDate() - numberOfDays));
      var rolls = await this.rollRepository.find({
        where:{
          completed_at: MoreThanOrEqual(pastDate.toISOString()),
        }
      })
      const rollIds = rolls.map(roll => roll.id)
      var studentRollStates = await this.studentRollStateRepository
      .createQueryBuilder('studentRollState')
        .select("COUNT(studentRollState.student_id) AS numberOfIncident, student_id")
        .where({
          roll_id: In(rollIds),
          state: In(roll_states)
        })
        .groupBy('studentRollState.student_id')
        .getRawMany();
      const filteredUserWhoMeetIncident = studentRollStates.filter(student => group.ltmt === ">" ? student.numberOfIncident > group.incidents : student.numberOfIncident < group.incidents )
      const groupStudent: StudentRollState[] = map(filteredUserWhoMeetIncident, (param) => {
        const createStudentRollStateInput: CreateGroupStudentInput = {
          group_id: group.id,
          student_id: param.student_id,
          incident_count: param.numberOfIncident,
        }

        const groupStudent = new GroupStudent()
        groupStudent.prepareToCreate(createStudentRollStateInput)
        return groupStudent
      })
      this.groupStudentRepository.save(groupStudent)
      const updateGroupAfterFilterInput: UpdateGroupAfterFilterInput = {
        id:group.id,
        run_at:new Date(),
        student_count: filteredUserWhoMeetIncident.length
      }
      this.groupRepository.save(updateGroupAfterFilterInput)
    }
    return studentRollStates

    // 3. Add the list of students that match the filter to the group
  }
}
