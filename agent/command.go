package main

import (
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

