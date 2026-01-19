// this function will check all elements of an array and return true if all elements are present in another array
export const isAllElementsPresent = <T>(array: T[], anotherArray: T[]) => {
	return array.every((element) => anotherArray.includes(element));
};
