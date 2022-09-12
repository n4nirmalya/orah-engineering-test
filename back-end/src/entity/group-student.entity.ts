import { Entity, PrimaryGeneratedColumn, Column } from "typeorm"
import { CreateGroupStudentInput } from "../interface/group-student.interface"

@Entity()
export class GroupStudent {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  student_id: number

  @Column()
  group_id: number

  @Column()
  incident_count: number

  public prepareToCreate(input: CreateGroupStudentInput) {
    this.student_id = input.student_id
    this.group_id = input.group_id
    this.incident_count = input.incident_count
  }

}
