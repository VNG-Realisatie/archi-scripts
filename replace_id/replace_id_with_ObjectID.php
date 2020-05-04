<?php



    $sourceFile  = '';


    if ( isset($argv[1])) {
        $sourceFile     = $argv[1];  // source file
    }


    echo PHP_EOL . "Processing: " . $sourceFile . PHP_EOL;



    $class = new idReplacer ( $sourceFile, $format );
    $class->run();

    /**
     *
     */
    class idReplacer

    {

        const NAME_SPACE            = 'a';
        const OBJECTID              = 'Object ID';
        const AMEFF                 = 'ameff';
        const ARCHI                 = 'archi';
        const VALUE                 = 'value';


        const ARCHIMATE_ELEMENT         = 'element';
        const ARCHIMATE_ELEMENTS        = 'Elements';
        const ARCHIMATE_RELATIONSHIP    = 'relationship';
        const ARCHIMATE_RELATIONSHIPS   = 'Relationships';
        const ARCHIMATE_VIEW            = 'view';
        const ARCHIMATE_VIEWS           = 'Views';
        const ARCHIMATE_PROPERTY        = 'property';
        const ARCHIMATE_IDENTIFIER      = 'identifier';

        //ArchiMate 3 variables
        const ARCHIMATE3_PROPERTYDEFS   = 'propertyDefinitions';
        const ARCHIMATE3_PROPERTYDEF    = 'propertyDefinition';
        const ARCHIMATE3_INDENTIFIERREF = 'propertyDefinitionRef';
        const ARCHIMATE3_VIEWS          = 'diagrams';

        //Archi  variables
        const ARCHI_ELEMENT         = 'element';
        const ARCHI_ELEMENTS        = 'Elements';
        const ARCHI_VIEWS           = 'views';
        const ARCHI_IDENTIFIER      = 'id';

        const ARCHI_PROPERTYDEFS   = 'properties';
        const ARCHI_PROPERTYDEF    = 'property';
        const ARCHI_INDENTIFIERREF = 'propertyDefinitionRef';


        /**
         *  constructor
         */
        public function __construct( $sourceFile ) {
            $this->sourceFile   = $sourceFile;

            // determine file extension
            $this->determineFileExtension() ;

            // determine prefix
            $this->determinePrefix();


        }

        /**
         * determine file extension for variable of file format
         */
        private function determineFileExtension () {
            $file_parts = pathinfo($this->sourceFile);
            $extension = $file_parts['extension'];

            switch( $extension )
            {
                case "xml":
                    $this->format = self::AMEFF;
                    break;

                case "archimate":
                    $this->format = self::ARCHI;
                    break;

                case "": // Handle file extension for files ending in '.'
                case NULL: // Handle no file extension
                default:
                    $this->format = "file type $extension not supported";

            }
            echo PHP_EOL . "Format: " . $this->format . PHP_EOL;
        }


        /**
         * determine the prefix for the XPath queries
         */
        private function determinePrefix() {

            switch ($this->format) {
                case self::AMEFF:
                    $this->prefix       = '//' . self::NAME_SPACE . ':';
                    break;
                case self::ARCHI:
                    $this->prefix       = '//';
                    break;
                default:
                    break;
            }

        }

        /**
         * Main function
         */
        public function run () {


            // create source dom document and parser
            $this->createSources();

            // register namespaces for parser queries
            $this->registerNameSpaces();

            // set variables
            $this->setVariables();

            // create list of properties
            $this->listOfPropertydefsSource = $this->createPropertyDefArray();

            // do the job
            $this->replaceIds();

            $file = date("YmdHis") . '-' . $this->sourceFile ;
            file_put_contents($file, $this->sourceContent);

        }


        /**
         * set class variables
         */
        private function setVariables() {

            switch ($this->format) {
                case self::AMEFF:
                    $this->setAMEFF3Variables();
                    break;
                case self::ARCHI:
                    $this->setArchiVariables();
                    break;
                default:
                    break;
            }
        }


        /**
         * create the array with property definitions
         *
         * @return list of properties
         */
        private function createPropertyDefArray() {

            $list = false;
            switch ($this->format) {
                case self::AMEFF:
                    $this->listOfPropertydefsSource = $this->createPropertyDefArrayWith(self::ARCHIMATE_IDENTIFIER);
                    break;
                case self::ARCHI:
                    $this->listOfPropertydefsSource = $this->createPropertyDefArrayWith(self::ARCHI_IDENTIFIER );
                    //var_dump($this->listOfPropertydefsSource);

                    break;
                default:
                    break;
            }

            return $list;
        }

        /*
         * loads the ArchiMate file into a string and create an XPath-object for querying
         */
        private function createSources() {
            $this->sourceContent = $this->readContent($this->sourceFile);
            $this->sourceDOMDoc = new DOMDocument();
            if ($this->sourceDOMDoc->loadXML($this->sourceContent)) {
                $this->sourceParser = new DOMXpath($this->sourceDOMDoc);
            } else {
                die ('Could not load XML string of ' .  $this->sourceFile );
            }
        }

        /**
         * read file content in string
         *
         * @param filename $file
         * @return string
         */
        private function readContent($file) {
            if (file_exists ( $file ) ){
                $content = file_get_contents($file);
                if (!$content) {
                    die ("Could not load input source file" . PHP_EOL) ;
                }
            } else {
                die ('Could not find source file'. PHP_EOL);
            }
            return $content;
        }

        /**
         * register name spaces
         */
        private function registerNameSpaces() {
            $this->rootNamespaceSource =  $this->sourceDOMDoc->lookupNamespaceUri($this->sourceDOMDoc->namespaceURI);
            $this->sourceParser->registerNamespace(self::NAME_SPACE, $this->rootNamespaceSource);
        }


        /**
         * sets the general ArchiMate 3 variables for AMEFF
         */
        private function setAMEFF3Variables() {
            $this->propertyDefs     = self::ARCHIMATE3_PROPERTYDEFS;
            $this->propertyDef      = self::ARCHIMATE3_PROPERTYDEF;
            $this->propertyDefRef   = self::ARCHIMATE3_INDENTIFIERREF;
            $this->tagDrawings      = self::ARCHIMATE3_VIEWS;
        }

        /**
         * sets the general ARCHI variables
         */
        private function setArchiVariables() {
            $this->propertyDefs     = self::ARCHI_PROPERTYDEFS;
            $this->propertyDef      = self::ARCHI_PROPERTYDEF;
            $this->propertyDefRef   = self::ARCHI_INDENTIFIERREF;
            $this->tagDrawings      = self::ARCHI_VIEWS;
        }

        /**
         * This function is the main function for the merge of the two files.
         */
        private function replaceIds()
        {
            $this->collectDataForProcessing();
            $this->replaceIdForObjectsFor();

        }

        /**
         * the replacement function that does the main work
         */
        private function replaceIdForObjectsFor () {
            switch ($this->format) {
                case self::AMEFF:
                    $this->replaceIdForObjects($this->sourceElements, self::ARCHIMATE_ELEMENTS, self::ARCHIMATE_IDENTIFIER);
                    $this->replaceIdForObjects($this->sourceRelationships, self::ARCHIMATE_RELATIONSHIPS, self::ARCHIMATE_IDENTIFIER);
                    $this->replaceIdForObjects($this->sourceViews, self::ARCHIMATE_VIEWS, self::ARCHIMATE_IDENTIFIER);
                    break;
                case self::ARCHI:
                    $this->replaceIdForObjects($this->sourceElements, self::ARCHI_ELEMENTS, self::ARCHI_IDENTIFIER);
                    break;
                default:

                    break;
            }
        }


        /**
         * relaces the actual Id's for a certain elementtype for an identity property
         *
         * @param $elements to be analyzed
         * @param $elementType
         * @param $propertyId
         */
        private function replaceIdForObjects ($elements, $elementType, $propertyId) {


            echo PHP_EOL . 'Starting with ' . $elementType . PHP_EOL;
            $counter = 0;
            $counter2 = 0;
            foreach ($elements as $element) {

                if ( $this->format == self::ARCHI ) {
                    $guid = $this->getPropertyValue($this->sourceParser, $element, self::OBJECTID);
                } else {
                    $guid = $this->getNodeValue($this->sourceParser, $element, self::OBJECTID);
                }

                $id = $this->getAttribute($element, $propertyId);

                if ( strstr( $id, 'id-' )  ) {
                    $prefix = 'id-';
                } else {
                    $prefix = '';
                }



                // If GUID AND ID are not indentical and the guid is not empty
                // then replace the id with the guid

                if ( $prefix . $guid <> $id &&
                    !empty ( $guid)
                ) {
                    if ( strlen( $guid ) < 32 ) {
                    //if ( $this->isGUID ($guid) ){
                        $oldGuid = $guid;
                        $guid = $this->createGUID($guid);
                        echo "New guid generated from $oldGuid --> ";
                    } //b5074647-34aa-4f9b-848b-c4d8a8b98dc5 = 8+1+4+4+4+12=33
                    echo "--> Id: $id is replaced by $prefix$guid" . PHP_EOL;
                    $this->sourceContent = str_replace($id, $prefix . $guid, $this->sourceContent);
                    $counter++;
                } else { // No OBJECT ID found and the id is not a guid
                    if ( strlen( $id ) < 32) {

                    //if ( $this->isGUID ($id) ){
                        $oldId = $id;
                        $guid = $this->createGUID($id);
                        echo "New guid generated from $oldId --> ";
                        echo "Id: $oldId is replaced by $prefix$guid" . PHP_EOL;
                        $this->sourceContent = str_replace($id, $prefix . $guid, $this->sourceContent);
                        $counter++;
                    } //(id-)b5074647-34aa-4f9b-848b-c4d8a8b98dc5 = 8+1+4+4+4+12=(36)33
                    else {
                        $counter2++;
                    }
                }
            }
            $total = $counter + $counter2;
            echo PHP_EOL . "$total $elementType have been processed." . PHP_EOL;
            echo "- $counter id's of $elementType have been replaced" . PHP_EOL;
            echo "- $counter2 id's of $elementType have NOT been replaced" . PHP_EOL;
        }


        /**
         * This function creates a stable guid on the basis of two other guids. Although this is not precisely a genuinely unique GUID
         * it is stable because the input guids are stable too.
         *
         * @param string $guid1
         * @param string $guid2
         *
         * @return string
         */
        private function createGUID( $guid1, $guid2 = null) {

            $charid = md5($guid1 . $guid2);
            $hyphen = chr(45);// "-"
            $guid = substr($charid, 0, 8) . $hyphen
                . substr($charid, 8, 4) . $hyphen
                . substr($charid,12, 4) . $hyphen
                . substr($charid,16, 4) . $hyphen
                . substr($charid,20,12);
            return strtolower($guid);

        }



        /**
         * create the data sets (dom node lists) for processing and get the general identifier for the attribute Object Id
         */
        private function collectDataForProcessing()
        {
            switch ($this->format) {
                case self::AMEFF:
                    $this->collectDataForProcessingAMEFF();
                    break;
                case self::ARCHI:
                    $this->collectDataForProcessingArchi();
                    break;
                default:
                    break;
            }
        }

        /**
         * creates the data sets for the AMEFF analysis
         */
        private function collectDataForProcessingAMEFF() {
            // process source
            $this->sourceElements         = $this->sourceParser->query($this->prefix . self::ARCHIMATE_ELEMENT);
            $this->sourceRelationships    = $this->sourceParser->query($this->prefix . self::ARCHIMATE_RELATIONSHIP);
            $this->sourceViews            = $this->sourceParser->query($this->prefix . self::ARCHIMATE_VIEW);
            //$this->sourceModelProperties  = $this->sourceParser->query($this->prefix . self::ARCHIMATE_PROPERTIES);
            //$this->sourceDiagrams         = $this->sourceParser->query($this->prefix . self::ARCHIMATE_DIAGRAMS)->item(0);



        }

        /**
         * creates the data sets for the Archi analysis
         */
        private function collectDataForProcessingArchi() {
            // process source
            $this->sourceElements         = $this->sourceParser->query($this->prefix . self::ARCHI_ELEMENT);
            //$this->sourceRelationships    = $this->sourceParser->query($this->prefix . self::ARCHI_RELATIONSHIP);
            //$this->sourceViews            = $this->sourceParser->query($this->prefix . self::ARCHI_VIEW);
            //$this->sourceModelProperties  = $this->sourceParser->query($this->prefix . self::ARCHI_PROPERTIES);
            //$this->sourceDiagrams         = $this->sourceParser->query($this->prefix . self::ARCHI_DIAGRAMS)->item(0);


        }

        /**
         * this function creates an array with propertydefs to be used in this class
         * for searching for existing propertydefs
         */

        private function createPropertyDefArrayWith ( $id ) {


            $propDefs = $this->sourceParser->query($this->prefix . $this->propertyDef);
            $i = 0;
            $results = array();
            foreach ($propDefs as $propDef) {
                $prop  = $this->getAttribute($propDef, $id);
                $value = trim($propDef->nodeValue) . PHP_EOL;
                $results[$prop] = $value;
                $i++;
            }

            return $results;
        }

        // check for correct GUID with or without curly braces
        private function isGUID ($id) {
            $id = str_replace ('id-', '', $id);
            if ( preg_match("/^(\{)?[a-f\d]{8}(-[a-f\d]{4}){4}[a-f\d]{8}(?(1)\})$/i", $id) ) {
                $result = false;
            } else {
                $result = true;
            }
            return $result;
        }



        /**
         * This functions searches for a certain propertydef in the propertydefs array
         * if found it returns the propertydefID
         *
         * @param string $propName
         * @return string
         */
        private function findPropertyDefID ( $propname ) {

            $propertyID = '';
            foreach($this->listOfPropertydefsSource as $key => $value) {
                if ( trim($value) === $propname ) {
                    $propertyID = $key;
                }
            }

            return $propertyID;

        }

        /**
         * This function searches for a value of an attribute of a given node
         *
         * @param XPathObject $parser
         * @param DOMNode $object
         * @param string $propName
         * @return string
         */
        private function getPropertyValue ($parser, $object, $propName) {
            $result = '';

            $properties = $parser->query("property[@key='" . $propName . "']", $object);
            foreach ( $properties as $property ) {
                $result  = $this->getAttribute($property, self::VALUE);
            }
            return $result;
        }

        /**
         * This function searches for the attribute of an object
         * and returns this value if found
         *
         * @param DOMNode $object
         * @param string $attribute
         * @return mixed
         */
        private function getAttribute ($object, $attribute) {
            $result = 'false';
            foreach ($object->attributes as $attr) {
                if ( $attr->nodeName == $attribute)  {
                    $result = $attr->nodeValue;
                    break;
                }
            }
            return $result;
        }


        /**
         * This function searches for a value of an attribute of a given node
         *
         * @param XPathObject $parser
         * @param DOMNode $object
         * @param string $propName
         * @return string
         */
        private function getNodeValue ($parser, $object, $propName) {
            $result = '';

            $properties = $parser->query('.' . $this->prefix . self::ARCHIMATE_PROPERTY, $object);
            foreach ( $properties as $property ) {
                $currentPropId =  $this->getAttribute($property, $this->propertyDefRef );
                if ( trim($currentPropId) == trim($this->objectId) )  {
                    $result = trim($property->nodeValue);
                    break;
                }
            }
            return $result;
        }


    }
die;



