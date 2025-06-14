import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChecklistTemplate, ChecklistTemplateDocument } from '../checklists/schemas/checklist-template.schema';
import { UsersService } from '../auth/users.service';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SeedService {
  constructor(
    @InjectModel(ChecklistTemplate.name)
    private checklistTemplateModel: Model<ChecklistTemplateDocument>,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  async seed() {
    await this.seedDefaultChecklists();
    await this.seedAdminUser();
    
    return { success: true, message: 'Seed completed successfully' };
  }

  async seedDefaultChecklists() {
    const count = await this.checklistTemplateModel.countDocuments();
    if (count > 0) {
      console.log('Checklists already seeded. Skipping...');
      return;
    }

    const maintenanceChecklist: any = {
      name: '90-Day Maintenance Checklist',
      description: 'Regular maintenance tasks to perform every 90 days',
      type: 'maintenance',
      isDefault: true,
      items: [
        {
          title: 'Inspect and clean roof seams and seals',
          description: 'Check for cracks, peeling, or damage to sealants around roof edges, vents, antennas, and other fixtures',
        },
        {
          title: 'Test RV batteries',
          description: 'Check fluid levels in batteries and clean terminals',
        },
        {
          title: 'Inspect tire pressure and condition',
          description: 'Check tire pressure when cold and inspect for signs of wear, cracking, or damage',
        },
        {
          title: 'Test smoke, CO, and LP detectors',
          description: 'Ensure all safety devices are functioning properly',
        },
        {
          title: 'Check fire extinguisher',
          description: 'Verify it is properly charged and accessible',
        },
        {
          title: 'Inspect and clean air conditioner filters',
          description: 'Remove and clean or replace filters as needed',
        },
        {
          title: 'Flush and sanitize fresh water system',
          description: 'Use approved RV water system sanitizer',
        },
        {
          title: 'Inspect plumbing for leaks',
          description: 'Check all connections, faucets, toilets, and exterior hookups',
        },
        {
          title: 'Lubricate locks, hinges, and moving parts',
          description: 'Apply silicone spray or appropriate lubricant',
        },
        {
          title: 'Check all exterior lights and turn signals',
          description: 'Replace any burned-out bulbs',
        },
      ],
    };
    
    const preDepartureChecklist: any = {
      name: 'Pre-Departure Checklist',
      description: 'Tasks to complete before starting your RV trip',
      type: 'pre-departure',
      isDefault: true,
      items: [
        {
          title: 'Check tire pressure and condition',
          description: 'Verify tires are properly inflated and in good condition',
        },
        {
          title: 'Inspect engine fluid levels',
          description: 'Check oil, coolant, brake fluid, power steering, and windshield washer fluid',
        },
        {
          title: 'Test all lights',
          description: 'Headlights, tail lights, brake lights, turn signals, and interior lights',
        },
        {
          title: 'Check propane level and ensure valves are closed',
          description: 'Propane should be turned off during travel',
        },
        {
          title: 'Fill fresh water tank',
          description: 'If needed for your trip',
        },
        {
          title: 'Empty holding tanks',
          description: 'Both black and grey water tanks should be emptied before departure',
        },
        {
          title: 'Secure loose items inside',
          description: 'Make sure everything is stowed properly or secured',
        },
        {
          title: 'Check roof for clear vents and antennas',
          description: 'Close roof vents and lower any antennas',
        },
        {
          title: 'Confirm all windows and doors are locked',
          description: 'Ensure everything is securely closed and latched',
        },
        {
          title: 'Stock emergency supplies',
          description: 'First aid kit, roadside emergency kit, and tool kit',
        },
      ],
    };
    
    const departureChecklist: any = {
      name: 'Departure Checklist',
      description: 'Final steps before hitting the road or leaving campsite',
      type: 'departure',
      isDefault: true,
      items: [
        {
          title: 'Disconnect shore power',
          description: 'Unplug and properly store power cord',
        },
        {
          title: 'Disconnect water hose',
          description: 'Drain and store properly',
        },
        {
          title: 'Disconnect and flush sewer hose',
          description: 'Empty, clean, and store properly',
        },
        {
          title: 'Retract awnings and slides',
          description: 'Make sure they are fully retracted and locked',
        },
        {
          title: 'Secure all external doors and compartments',
          description: 'Check that all exterior compartments are closed and locked',
        },
        {
          title: 'Remove wheel chocks',
          description: 'After releasing parking brake',
        },
        {
          title: 'Raise leveling jacks',
          description: 'Ensure they are fully retracted',
        },
        {
          title: 'Double-check tow connection',
          description: 'Safety chains, breakaway cable, and lights',
        },
        {
          title: 'Do a final walkaround',
          description: 'Look for anything left behind or issues',
        },
        {
          title: 'Check campsite for cleanliness',
          description: 'Pick up any trash and ensure fire is completely out',
        },
      ],
    };

    const templates = [maintenanceChecklist, preDepartureChecklist, departureChecklist];

    try {
      await this.checklistTemplateModel.create(templates);
      console.log('Default checklists seeded successfully');
    } catch (error) {
      console.error('Error seeding default checklists:', error);
    }
  }

  private async seedAdminUser() {
    try {
      const adminEmail = this.configService.get('ADMIN_EMAIL') || 'admin@rvchecklist.com';
      const existingUser = await this.usersService.findByEmail(adminEmail);
      
      if (!existingUser) {
        const adminUser: CreateUserDto = {
          email: adminEmail,
          password: this.configService.get('ADMIN_PASSWORD') || 'Admin123!',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
        };
        
        await this.usersService.create(adminUser);
        console.log('Admin user created successfully');
      } else {
        console.log('Admin user already exists');
      }
    } catch (error) {
      console.error('Error seeding admin user:', error);
    }
  }
}
