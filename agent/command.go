package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	pb "k8s-dashboard/agents/pb/agent-backend"
	"k8s-dashboard/agents/service/k8s"
)

func handleCommand(kc *k8s.K8sClient, cmd *pb.Command) (string, error) {
	log.Printf("[Command] Handling ID:%s Type:%v Namespace:%s Name:%s", cmd.Id, cmd.Type, cmd.TargetNamespace, cmd.TargetName)
	var err error
	var resultData string

	switch cmd.Type {
	case pb.Command_EDIT_RESOURCE,
		pb.Command_CREATE_DEPLOYMENT,
		pb.Command_CREATE_POD,
		pb.Command_CREATE_SERVICE,
		pb.Command_CREATE_RESOURCE,
		pb.Command_CREATE_SECRET,
		pb.Command_CREATE_CONFIGMAP,
		pb.Command_CREATE_INGRESS:
		if cmd.Payload != "" {
			log.Printf("[Command] Applying manifest for command ID:%s (Payload size: %d bytes)", cmd.Id, len(cmd.Payload))
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "Resource applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for CREATE/EDIT command")
		}
	case pb.Command_SCALE_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			replicas, convErr := strconv.Atoi(cmd.Payload)
			if convErr != nil {
				err = fmt.Errorf("invalid replicas payload: %v", convErr)
			} else if replicas < 0 || replicas > 1000 {
				err = fmt.Errorf("replicas must be between 0 and 1000")
			} else {
				err = kc.ScaleDeployment(cmd.TargetNamespace, cmd.TargetName, int32(replicas))
				if err == nil {
					resultData = fmt.Sprintf("Deployment scaled to %d replicas", replicas)
				}
			}
		} else {
			err = fmt.Errorf("missing target or payload for SCALE command")
		}
	case pb.Command_DELETE_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.DeleteDeployment(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Deployment deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_DEPLOYMENT command")
		}
	case pb.Command_DELETE_POD:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.DeletePod(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Pod deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_POD command")
		}
	case pb.Command_DELETE_SERVICE:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.DeleteService(cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = "Service deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_SERVICE command")
		}
	case pb.Command_DELETE_RESOURCE,
		pb.Command_DELETE_INGRESS:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			err = kc.DeleteResource(cmd.TargetNamespace, cmd.TargetName, cmd.Payload)
			if err == nil {
				resultData = fmt.Sprintf("%s deleted successfully", cmd.Payload)
			}
		} else {
			err = fmt.Errorf("missing target or kind (payload) for DELETE_RESOURCE command")
		}
	case pb.Command_DELETE_NODE:
		if cmd.TargetName != "" {
			err = kc.DeleteNode(cmd.TargetName)
			if err == nil {
				resultData = "Node deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target_name for DELETE_NODE command")
		}
	case pb.Command_GET_JOIN_TOKEN:
		log.Printf("[Command] Generating join token for command ID:%s", cmd.Id)
		if cmdStr, joinErr := kc.GenerateJoinCommand(); joinErr != nil {
			err = fmt.Errorf("failed to generate join token: %v", joinErr)
		} else {
			resultData = cmdStr
		}
	case pb.Command_DESCRIBE_RESOURCE:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			var payload struct {
				Kind string `json:"kind"`
			}
			if unmarshalErr := json.Unmarshal([]byte(cmd.Payload), &payload); unmarshalErr != nil {
				err = fmt.Errorf("invalid payload for DESCRIBE_RESOURCE: %v", unmarshalErr)
			} else {
				resultData, err = kc.DescribeResource(cmd.TargetNamespace, cmd.TargetName, payload.Kind)
			}
		} else {
			err = fmt.Errorf("missing target or payload for DESCRIBE_RESOURCE command")
		}
	case pb.Command_GET_ALL_EVENTS:
		resultData, err = kc.GetAllEvents(kc.Context)
	case pb.Command_REDEPLOY_DEPLOYMENT:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			err = kc.RedeployDeployment(kc.Context, cmd.TargetNamespace, cmd.TargetName)
			if err == nil {
				resultData = fmt.Sprintf("Deployment %s/%s redeployed successfully", cmd.TargetNamespace, cmd.TargetName)
			}
		} else {
			err = fmt.Errorf("missing target for REDEPLOY_DEPLOYMENT command")
		}
	case pb.Command_CREATE_PVC,
		pb.Command_EDIT_PVC:
		if cmd.Payload != "" {
			log.Printf("[Command] Applying PVC manifest for command ID:%s (Payload size: %d bytes)", cmd.Id, len(cmd.Payload))
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "PVC applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for PVC CREATE/EDIT command")
		}
	case pb.Command_DELETE_PVC:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" {
			log.Printf("[Command] Deleting PVC %s/%s", cmd.TargetNamespace, cmd.TargetName)
			err = kc.DeleteResource(cmd.TargetNamespace, cmd.TargetName, "PersistentVolumeClaim")
			if err == nil {
				resultData = "PVC deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target for DELETE_PVC command")
		}
	case pb.Command_RESIZE_PVC:
		if cmd.TargetNamespace != "" && cmd.TargetName != "" && cmd.Payload != "" {
			log.Printf("[Command] Resizing PVC %s/%s to %s", cmd.TargetNamespace, cmd.TargetName, cmd.Payload)
			// For resizing, we usually apply the updated PVC manifest which contains the new storage request size.
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = fmt.Sprintf("PVC %s/%s resized successfully to %s", cmd.TargetNamespace, cmd.TargetName, cmd.Payload)
			}
		} else {
			err = fmt.Errorf("missing target or payload for RESIZE_PVC command")
		}
	case pb.Command_CREATE_STORAGE_CLASS:
		if cmd.Payload != "" {
			log.Printf("[Command] Applying StorageClass manifest for command ID:%s (Payload size: %d bytes)", cmd.Id, len(cmd.Payload))
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "StorageClass applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for CREATE_STORAGE_CLASS command")
		}
	case pb.Command_DELETE_STORAGE_CLASS:
		if cmd.TargetName != "" {
			log.Printf("[Command] Deleting StorageClass %s", cmd.TargetName)
			err = kc.DeleteStorageClass(cmd.TargetName)
			if err == nil {
				resultData = "StorageClass deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target_name for DELETE_STORAGE_CLASS command")
		}
	case pb.Command_SET_DEFAULT_STORAGE_CLASS:
		if cmd.TargetName != "" && cmd.Payload != "" {
			log.Printf("[Command] Setting StorageClass %s as default", cmd.TargetName)
			err = kc.SetDefaultStorageClass(cmd.TargetName, cmd.Payload == "true")
			if err == nil {
				resultData = fmt.Sprintf("StorageClass %s default set to %s", cmd.TargetName, cmd.Payload)
			}
		} else {
			err = fmt.Errorf("missing target_name or payload for SET_DEFAULT_STORAGE_CLASS command")
		}
	case pb.Command_CREATE_PV:
		if cmd.Payload != "" {
			log.Printf("[Command] Applying PV manifest for command ID:%s (Payload size: %d bytes)", cmd.Id, len(cmd.Payload))
			err = kc.ApplyManifest(cmd.Payload)
			if err == nil {
				resultData = "PersistentVolume applied successfully"
			}
		} else {
			err = fmt.Errorf("payload empty for CREATE_PV command")
		}
	case pb.Command_DELETE_PV:
		if cmd.TargetName != "" {
			log.Printf("[Command] Deleting PV %s", cmd.TargetName)
			err = kc.DeletePV(cmd.TargetName)
			if err == nil {
				resultData = "PersistentVolume deleted successfully"
			}
		} else {
			err = fmt.Errorf("missing target_name for DELETE_PV command")
		}
	default:
		log.Printf("[Command] Unknown command type: %v (ID:%s)", cmd.Type, cmd.Id)
		return "", fmt.Errorf("unknown command type: %v", cmd.Type)
	}

	if err != nil {
		log.Printf("[Command] Error executing command %s: %v", cmd.Id, err)
		return "", err
	}
	log.Printf("[Command] Successfully executed command %s. Result: %s", cmd.Id, resultData)
	return resultData, nil
}
