import { NextFunction, Request, Response } from "express"
import { getRepository, In } from "typeorm"
import { GroupStudent } from "../entity/group-student.entity";
import { Group } from "../entity/group.entity"
import { Roll } from "../entity/roll.entity"
import { StudentRollState } from "../entity/student-roll-state.entity";
import { CreateGroupInput, UpdateGroupInput, UpdateGroupAfterFilterInput } from "../interface/group.interface";
import { map } from "lodash"
import { CreateGroupStudentInput } from "../interface/group-student.interface";
import { Student } from "../entity/student.entity";


export class GroupController {
  private groupRepository = getRepository(Group);
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRollStateRepository = getRepository(StudentRollState)
  private studentRepository = getRepository(Student)



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
    const { params } = request
    const studentInfo = await this.studentRepository.createQueryBuilder("student")
      .select(`id,first_name,last_name, first_name||" "||last_name AS full_name`)
      .where(qb => {
        const subQuery = qb.subQuery()
          .select(['group_student.student_id'])
          .from(GroupStudent, "group_student")
          .where('group_student.group_id = :group_id')
          .getQuery()
        return "student.id IN" + subQuery
      })
      .setParameter("group_id", params.id)
      .getRawMany()
    return studentInfo
  }


  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    this.groupStudentRepository.clear()
    const groups = await this.groupRepository.find()
    console.log('groups', groups)
    const studentRollStateResponse = []
    for (let group of groups) {
      const roll_states = group.roll_states.split(',')
      const numberOfWeeks = group.number_of_weeks
      const daysPerWeek = 7
      const numberOfDays = numberOfWeeks * daysPerWeek
      const pastDate = new Date(new Date().setDate(new Date().getDate() - numberOfDays));
      var studentRollStates = await this.studentRollStateRepository
        .createQueryBuilder('studentRollState')
        .select("COUNT(studentRollState.student_id) AS numberOfIncident, student_id")
        .where({
          state: In(roll_states)
        })
        .andWhere(qb => {
          const subQuery = qb
            .subQuery()
            .select(['roll.id'])
            .from(Roll, "roll")
            .where("roll.completed_at >= :completed_at")
            .getQuery()
          return `studentRollState.roll_id IN` + subQuery
        })
        .setParameter("completed_at", pastDate.toISOString())
        .groupBy('studentRollState.student_id')
        .andHaving(`${group.ltmt === ">" ? "numberOfIncident >" : "numberOfIncident <"}${group.incidents}`)
        .getRawMany();
      const groupStudent: StudentRollState[] = map(studentRollStates, (param) => {
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
      if (studentRollStates.length) {
        const updateGroupAfterFilterInput: UpdateGroupAfterFilterInput = {
          id: group.id,
          run_at: new Date(),
          student_count: studentRollStates.length
        }
        this.groupRepository.save(updateGroupAfterFilterInput)
      }
      studentRollStateResponse.push({incidentCount:studentRollStates,group_id:group.id,incidentAllowed:group.incidents})
    }
    return studentRollStateResponse
  }
}
